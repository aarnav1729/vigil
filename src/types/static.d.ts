// src/types/static.d.ts
declare module "*.glb?url" {
  const src: string;
  export default src;
}

declare module "*.glb" {
  const src: string;
  export default src;
}
