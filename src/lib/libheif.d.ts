declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  type Pixels = { width: number; height: number; data: Uint8ClampedArray };
  type HeifImage = {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    display(pixels: Pixels, callback: (pixels: Pixels | null) => void): void;
    free(): void;
  };
  export default function createDecoder(options: { print: () => void; printErr: () => void }): Promise<{
    HeifDecoder: new () => { decoder: number | null; decode(bytes: Uint8Array): HeifImage[] };
    heif_context_free(context: number): void;
  }>;
}
