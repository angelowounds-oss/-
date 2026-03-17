/**
 * LBM3D: WebGPU-based 3D D3Q19 Lattice-Boltzmann Simulation
 * with Smagorinsky LES turbulence model
 */

class LBM3D {
  constructor(canvas, width = 256, height = 128, depth = 64) {
    this.canvas = canvas;
    this.W = width;
    this.H = height;
    this.D = depth;
    this.gridSize = width * height * depth;

    // GPU 리소스 (미초기화)
    this.device = null;
    this.queue = null;
    this.computeShader = null;
    this.initShader = null;
    this.computePipeline = null;
    this.initPipeline = null;

    // 버퍼
    this.bufferF_A = null;
    this.bufferF_B = null;
    this.bufferMacroVars = null;
    this.bufferBoundary = null;
    this.bufferParams = null;

    // Bind groups
    this.bindGroupA = null;
    this.bindGroupB = null;

    // 파라미터
    this.windSpeed = 0.1;
    this.tauLaminar = 0.8;
    this.cSmag = 0.1;

    // 통계
    this.stepCount = 0;
    this.lastStepTime = 0;

    this.init();
  }

  async init() {
    // WebGPU 어댑터 및 디바이스 얻기
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
      throw new Error('WebGPU not supported');
    }

    this.device = await adapter.requestDevice();
    this.queue = this.device.queue;

    // 셰이더 모듈 생성
    this.initShader = this.device.createShaderModule({
      code: WGSL.LBM_INIT
    });

    this.computeShader = this.device.createShaderModule({
      code: WGSL.LBM_COMPUTE
    });

    // 파이프라인 생성
    this.initPipeline = await this.device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module: this.initShader, entryPoint: 'init' }
    });

    this.computePipeline = await this.device.createComputePipelineAsync({
      layout: 'auto',
      compute: { module: this.computeShader, entryPoint: 'lbm_step' }
    });

    // 버퍼 할당
    this._createBuffers();

    // 초기화
    this._initializeDistributions();

    console.log(`LBM3D initialized: ${this.W}×${this.H}×${this.D}`);
  }

  _createBuffers() {
    const device = this.device;

    // 분포함수: 19 float32 per cell
    // vec4 × 5로 패킹 (19개 = 4+4+4+4+3)
    const bufferSize = this.gridSize * 5 * 4 * 4;  // 5 vec4f per cell, 4 bytes per f32

    this.bufferF_A = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true
    });
    new Float32Array(this.bufferF_A.getMappedRange()).fill(0.0);
    this.bufferF_A.unmap();

    this.bufferF_B = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC
    });

    // 거시 변수 (rho, ux, uy, uz)
    this.bufferMacroVars = device.createBuffer({
      size: this.gridSize * 4 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    // 경계 조건 플래그 (1 uint32 per cell)
    const boundaryData = new Uint32Array(this.gridSize);
    this.bufferBoundary = device.createBuffer({
      size: boundaryData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Uint32Array(this.bufferBoundary.getMappedRange()).set(boundaryData);
    this.bufferBoundary.unmap();

    // 파라미터 uniform
    this.bufferParams = device.createBuffer({
      size: 16,  // 4 f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    const paramData = new Float32Array(this.bufferParams.getMappedRange());
    paramData[0] = this.windSpeed;
    paramData[1] = this.tauLaminar;
    paramData[2] = this.cSmag;
    this.bufferParams.unmap();

    // Bind groups
    this.bindGroupA = device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bufferF_A } },
        { binding: 1, resource: { buffer: this.bufferF_B } },
        { binding: 2, resource: { buffer: this.bufferMacroVars } },
        { binding: 3, resource: { buffer: this.bufferBoundary } },
        { binding: 4, resource: { buffer: this.bufferParams } }
      ]
    });

    this.bindGroupB = device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.bufferF_B } },
        { binding: 1, resource: { buffer: this.bufferF_A } },
        { binding: 2, resource: { buffer: this.bufferMacroVars } },
        { binding: 3, resource: { buffer: this.bufferBoundary } },
        { binding: 4, resource: { buffer: this.bufferParams } }
      ]
    });
  }

  _initializeDistributions() {
    const device = this.device;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(this.initPipeline);
    pass.setBindGroup(0, this.bindGroupA);

    const wg = 8;  // workgroup size
    pass.dispatchWorkgroups(
      Math.ceil(this.W / wg),
      Math.ceil(this.H / wg),
      Math.ceil(this.D / wg)
    );
    pass.end();

    this.queue.submit([encoder.finish()]);
  }

  /**
   * 경계 데이터 업데이트 (스포일러 각도 변경 시 호출)
   */
  setBoundaryData(boundaryArray) {
    if (boundaryArray.length !== this.gridSize) {
      console.error('Boundary array size mismatch');
      return;
    }
    this.queue.writeBuffer(this.bufferBoundary, 0, boundaryArray);
  }

  /**
   * 파라미터 업데이트
   */
  setParameters(windSpeed, tauLaminar, cSmag) {
    this.windSpeed = windSpeed;
    this.tauLaminar = tauLaminar;
    this.cSmag = cSmag;

    const paramData = new Float32Array(4);
    paramData[0] = windSpeed;
    paramData[1] = tauLaminar;
    paramData[2] = cSmag;
    this.queue.writeBuffer(this.bufferParams, 0, paramData);
  }

  /**
   * 한 타임스텝 실행
   */
  step() {
    const device = this.device;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(this.computePipeline);

    // Ping-pong: 현재 상태를 읽고, 다음 상태에 쓰기
    const bindGroup = (this.stepCount % 2 === 0) ? this.bindGroupA : this.bindGroupB;
    pass.setBindGroup(0, bindGroup);

    const wg = 8;
    pass.dispatchWorkgroups(
      Math.ceil(this.W / wg),
      Math.ceil(this.H / wg),
      Math.ceil(this.D / 4)  // depth는 4로 나눔 (workgroup_size.z = 4)
    );
    pass.end();

    const start = performance.now();
    this.queue.submit([encoder.finish()]);
    const end = performance.now();

    this.lastStepTime = end - start;
    this.stepCount++;
  }

  /**
   * 거시 변수 읽기 (GPU → CPU)
   * 성능 주의: readback은 GPU 플러시를 유발
   */
  async readMacroVars() {
    const device = this.device;
    const stagingBuffer = device.createBuffer({
      size: this.gridSize * 4 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
    });

    const encoder = device.createCommandEncoder();
    encoder.copyBufferToBuffer(
      this.bufferMacroVars, 0,
      stagingBuffer, 0,
      this.gridSize * 4 * 4
    );
    this.queue.submit([encoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const data = new Float32Array(stagingBuffer.getMappedRange()).slice();
    stagingBuffer.unmap();

    return data;
  }

  /**
   * 슬라이스 데이터 읽기 (특정 Y 또는 X 평면)
   */
  async readSlice(sliceType = 'xz', sliceIndex = null) {
    const data = await this.readMacroVars();

    if (sliceType === 'xz') {
      // Y = sliceIndex (기본값: H/2)
      const y = sliceIndex ?? Math.floor(this.H / 2);
      const sliceData = new Float32Array(this.W * this.D * 4);
      for (let x = 0; x < this.W; x++) {
        for (let z = 0; z < this.D; z++) {
          const srcIdx = (x + y * this.W + z * this.W * this.H) * 4;
          const dstIdx = (x + z * this.W) * 4;
          sliceData[dstIdx + 0] = data[srcIdx + 0];  // rho
          sliceData[dstIdx + 1] = data[srcIdx + 1];  // ux
          sliceData[dstIdx + 2] = data[srcIdx + 2];  // uy
          sliceData[dstIdx + 3] = data[srcIdx + 3];  // uz
        }
      }
      return sliceData;
    } else if (sliceType === 'yz') {
      // X = sliceIndex (기본값: W/2)
      const x = sliceIndex ?? Math.floor(this.W / 2);
      const sliceData = new Float32Array(this.H * this.D * 4);
      for (let y = 0; y < this.H; y++) {
        for (let z = 0; z < this.D; z++) {
          const srcIdx = (x + y * this.W + z * this.W * this.H) * 4;
          const dstIdx = (y + z * this.H) * 4;
          sliceData[dstIdx + 0] = data[srcIdx + 0];
          sliceData[dstIdx + 1] = data[srcIdx + 1];
          sliceData[dstIdx + 2] = data[srcIdx + 2];
          sliceData[dstIdx + 3] = data[srcIdx + 3];
        }
      }
      return sliceData;
    }
  }

  getGridSize() {
    return { W: this.W, H: this.H, D: this.D };
  }

  getStepCount() {
    return this.stepCount;
  }

  getLastStepTime() {
    return this.lastStepTime;
  }
}

// 전역 변수로 내보내기
window.LBM3D = LBM3D;
