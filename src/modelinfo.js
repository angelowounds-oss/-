// Dimensions of the supplied residential tower models (res_01..res_10), shared by the world generator and the skin renderer.
export const MODEL_H = [18.4, 22.0, 29.2, 36.4, 40.0, 47.2, 68.8, 72.4, 86.8, 104.8];
export const MODEL_W = 12.6;  // footprint depth in model space (x)
export const MODEL_D = 23.1;  // footprint length in model space (z)
export const MODEL_PROM = 22; // walkable promenade between the city edge and the model buildings
export const MODEL_VARIANTS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 7, 8, 10]; // weighted toward the shorter blocks
