// The missions as data (EV-70): what each asks, where (place rules over the EV-72 place index, with a road-side fallback), the reward, the time
// limit and its steps. src/missions/runner.js plays them; tests/unit/missions.test.mjs checks every one against the step schema and
// tests/e2e/mission-bot.test.cjs plays every one through. Plain JSON-shaped objects (no functions) so they can move to a file or a mod later.
//
// A mission: { id, title, text, reward, rewardStep? (added per repeat, i % 5), limit? (s), type, steps: [step...] }
// A step: { do, text? (the mission line while it runs), save? (a name later steps refer to), ...its own fields (runner.js STEPS) }
// A place rule `at`: { kinds?: [place kinds], min, max, from?: 'player' | a saved name, label? } or { ref: a saved name }

// the story: played once, in order, from a new game
export const STORY = [
  { id: 'first-meet', type: 'goto', title: '첫 만남', text: '의뢰인이 기다리고 있다. 표시된 장소로 이동하라. (차량 탑승: {key:use})', reward: 300,
    steps: [{ do: 'goto', at: { kinds: ['cafe', 'convenience', 'food'], min: 120, max: 260 } }] },
  { id: 'steal-car', type: 'steal', title: '차량 탈취', text: '붉은 스포츠카를 찾아 탈취하라.', reward: 800,
    steps: [
      { do: 'stealCar', car: { type: 'sport', color: 0xd01030 }, at: { min: 140, max: 260 }, save: 'car' },
      { do: 'heat', add: 12 },
      { do: 'deliverCar', car: 'car', at: { kinds: ['car_repair'], min: 260, max: 420, label: '차고' }, limit: 150, text: '차를 목적지 차고로 가져가라. 경찰을 조심!', clearWanted: true },
    ] },
  { id: 'clear-gang', type: 'gang', title: '갱단 소탕', text: '표시된 구역의 갱단원을 모두 제거하라.', reward: 1200,
    steps: [{ do: 'gang', at: { min: 140, max: 260 }, n: 7, hp: 75 }] },
  { id: 'cash-bag', type: 'heist', title: '현금 가방', text: '가방을 회수하라. 경찰이 곧 출동한다!', reward: 2000,
    steps: [
      { do: 'goto', at: { min: 150, max: 280 }, r: 3.5 },
      { do: 'heat', add: 75, toast: ['가방 확보', '경찰 출동!'] },
      { do: 'escape', after: 8, text: '경찰을 따돌려라! (시야에서 벗어나 숨어라)' },
    ] },
  { id: 'rooftop', type: 'goto', title: '옥상으로', text: '표시된 건물 옥상에 올라가라. 정문으로 들어가 엘리베이터나 계단을 이용.', reward: 1800,
    steps: [{ do: 'roof', fallback: { do: 'goto', at: { min: 150, max: 320 }, text: '표시된 장소로 이동해 상황을 확인하라.' } }] },
];

// contracts: after the story, round and round (missionIndex - STORY.length) % POOL.length; the twelve kinds of EV-70 and the two older contracts
export const POOL = [
  { id: 'delivery', type: 'delivery', title: '배달 계약', text: '가게에서 물건을 받아 목적지까지 배달하라.', reward: 400, rewardStep: 150, limit: 420,
    steps: [
      { do: 'goto', at: { kinds: ['convenience', 'supermarket'], min: 120, max: 400 }, save: 'shop', text: '{shop}에서 물건을 받아라.' },
      { do: 'goto', at: { kinds: ['food', 'cafe', 'hotel', 'bank', 'pharmacy'], min: 250, max: 900, from: 'shop' }, save: 'to', text: '물건을 {to}에 전달하라.' },
    ] },
  { id: 'bounty', type: 'gang', title: '현상금 사냥', text: '갱단 두목과 부하들을 제거하라.', reward: 1000, rewardStep: 250,
    steps: [{ do: 'gang', at: { min: 140, max: 300 }, n: 6, hp: 80, boss: true }] },
  { id: 'taxi', type: 'taxi', title: '택시 운행', text: '손님을 태워 목적지까지 모셔라.', reward: 300, rewardStep: 60, limit: 600,
    steps: [
      { do: 'passenger', at: { kinds: ['hotel', 'bus_station', 'cafe', 'food'], min: 80, max: 300 }, save: 'fare', text: '{fare} 앞 손님을 태워라 (차로 접근).' },
      { do: 'dropoff', npc: 'fare', at: { kinds: ['hotel', 'hospital', 'bus_station', 'supermarket', 'school'], min: 500, max: 2500 }, save: 'dest', text: '손님을 {dest}까지 모셔라.' },
    ] },
  { id: 'chase', type: 'chase', title: '도주 차량 추격', text: '달아나는 차를 세워라 (부수거나 멈춰 세운다).', reward: 1100, rewardStep: 150,
    steps: [{ do: 'chase', speed: 27, fallback: { do: 'gang', at: { min: 120, max: 260 }, n: 4, hp: 70, text: '도주범 일당을 처리하라.' } }] },
  { id: 'escort', type: 'escort', title: '요인 호위', text: '요인을 태워 안전하게 모셔라. 매복을 조심.', reward: 1300, rewardStep: 150, limit: 600,
    steps: [
      { do: 'passenger', at: { kinds: ['hotel', 'bank'], min: 100, max: 320 }, save: 'vip', look: 'vip', text: '{vip} 앞에서 요인을 태워라.' },
      { do: 'gang', at: { min: 60, max: 140 }, n: 3, hp: 60, wait: false },
      { do: 'dropoff', npc: 'vip', at: { kinds: ['hotel', 'bank', 'hospital'], min: 600, max: 2000 }, save: 'safe', text: '요인을 {safe}까지 모셔라.' },
    ] },
  { id: 'robbery', type: 'heist', title: '강도', text: '가게를 털고 경찰을 따돌려라.', reward: 1500, rewardStep: 200,
    steps: [
      { do: 'goto', at: { kinds: ['convenience', 'bank', 'pharmacy'], min: 150, max: 400 }, save: 'mark', r: 4, text: '{mark}로 가라.' },
      { do: 'wait', at: { ref: 'mark' }, s: 6, r: 6, label: '터는 중', text: '자리를 지켜라.' },
      { do: 'heat', add: 60, toast: ['강도 신고', '경찰 출동!'] },
      { do: 'escape', after: 6, text: '경찰을 따돌려라!' },
    ] },
  { id: 'kidnap', type: 'kidnap', title: '납치', text: '표적을 차에 태워 은신처로 데려가라.', reward: 1400, rewardStep: 150, limit: 600,
    steps: [
      { do: 'passenger', at: { kinds: ['school', 'cafe', 'food', 'supermarket'], min: 100, max: 320 }, save: 'mark', text: '{mark} 앞의 표적을 차에 태워라.' },
      { do: 'heat', add: 30 },
      { do: 'dropoff', npc: 'mark', at: { kinds: ['car_repair'], min: 500, max: 1800, label: '은신처' }, save: 'hide', text: '표적을 {hide}로 데려가라.' },
    ] },
  { id: 'arson', type: 'arson', title: '방화', text: '표시된 장소에 불을 질러라.', reward: 1200, rewardStep: 150, limit: 420,
    steps: [
      { do: 'ignite', at: { kinds: ['car_repair', 'fuel', 'supermarket'], min: 150, max: 420 }, save: 'site', text: '{site}에 불을 질러라.' },
      { do: 'heat', add: 40 },
      { do: 'escape', after: 4, text: '현장을 벗어나 경찰을 따돌려라.' },
    ] },
  { id: 'infiltrate', type: 'infiltrate', title: '잠입', text: '경비에게 들키지 않고 표시된 곳에 닿아라.', reward: 1500, rewardStep: 150,
    steps: [{ do: 'guards', at: { kinds: ['bank', 'hotel', 'police'], min: 160, max: 380 }, n: 4, save: 'site', text: '{site} 경비를 피해 표시된 곳에 닿아라.' }] },
  { id: 'collect', type: 'collect', title: '수거', text: '세 곳을 돌며 물건을 거둬라.', reward: 900, rewardStep: 120, limit: 600,
    steps: [
      { do: 'goto', at: { kinds: ['convenience'], min: 120, max: 450 }, save: 'a', text: '첫 번째: {a}' },
      { do: 'goto', at: { kinds: ['convenience', 'supermarket'], min: 150, max: 500, from: 'a' }, save: 'b', text: '두 번째: {b}' },
      { do: 'goto', at: { kinds: ['convenience', 'supermarket', 'fuel'], min: 150, max: 500, from: 'b' }, save: 'c', text: '마지막: {c}' },
    ] },
  { id: 'race', type: 'race', title: '거리 경주', text: '차를 타고 지점을 차례로 통과하라.', reward: 1000, rewardStep: 150, limit: 240,
    steps: [{ do: 'checkpoints', n: 5, gap: [180, 320], r: 14, text: '지점을 차례로 통과하라 (차량).' }] },
  { id: 'photo', type: 'photo', title: '현장 촬영', text: '표시된 장소에서 사진을 찍어라.', reward: 600, rewardStep: 100, limit: 420,
    steps: [
      { do: 'goto', at: { kinds: ['police', 'bank', 'hotel', 'fire'], min: 150, max: 450 }, save: 'site', r: 8, text: '{site}로 가라.' },
      { do: 'wait', at: { ref: 'site' }, s: 5, r: 10, foot: true, label: '촬영 중', text: '걸어서 자리를 지키며 찍어라.' },
    ] },
  { id: 'rescue', type: 'rescue', title: '응급 구조', text: '다친 사람을 병원으로 옮겨라.', reward: 900, rewardStep: 120, limit: 420,
    steps: [
      { do: 'passenger', at: { min: 100, max: 300 }, save: 'hurt', look: 'injured', text: '다친 사람을 차에 태워라.' },
      { do: 'dropoff', npc: 'hurt', at: { kinds: ['hospital'], min: 300, max: 3000, label: '병원' }, save: 'er', text: '{er}으로 서둘러라.' },
    ] },
  { id: 'scout', type: 'goto', title: '현장 확인', text: '표시된 장소로 이동해 상황을 확인하라.', reward: 700, rewardStep: 100,
    steps: [{ do: 'goto', at: { kinds: ['bus_station', 'fuel', 'school'], min: 150, max: 400 } }] },
];

// the mission played at index i of the save's count
export function missionDef(i) { return i < STORY.length ? STORY[i] : POOL[(i - STORY.length) % POOL.length]; }

// the step kinds runner.js plays and the fields each must have (tests/unit/missions.test.mjs checks the missions above against them, and
// runner.js's STEPS against this list)
export const STEP_KINDS = {
  goto: ['at'], wait: ['at', 's'], stealCar: ['car', 'at'], deliverCar: ['car', 'at'], gang: ['at', 'n'], guards: ['at', 'n'], heat: ['add'], escape: [],
  passenger: ['at'], dropoff: ['npc', 'at'], ignite: ['at'], checkpoints: ['n', 'gap'], chase: [], roof: [],
};
