declare module "*/java.wasm-runtime.js" {
    export async function load(src: string);
}

declare module "*/vf.runtime.js" {
    export function decompile(name: string, config?: Config): Promise<string>;
}