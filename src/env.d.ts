declare module "virtual:asset-sizes" {
  /** Bytes per model (by file name without .glb) and for the sky ("sky"); see vite.config.ts. */
  const sizes: Record<string, number>;
  export default sizes;
}
