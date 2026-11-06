import { RGB } from "./types";

export type Xyz = { x: number; y: number; z: number };
export type Lab = { l: number; a: number; b: number };

// D65 reference white
const WHITE = { x: 0.95047, y: 1, z: 1.08883 };

export function hexToRgb(hex: string): RGB {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) throw new Error(`Invalid hex color: ${hex}`);
  const value = parseInt(match[1], 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

function channelToHex(channel: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, channel)) * 255);
  return byte.toString(16).padStart(2, "0");
}

export function rgbToHex(rgb: RGB): string {
  return ("#" + channelToHex(rgb.r) + channelToHex(rgb.g) + channelToHex(rgb.b)).toUpperCase();
}

export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

export function rgbToXyz(rgb: RGB): Xyz {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return {
    x: 0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    y: 0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    z: 0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  };
}

function labF(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

export function xyzToLab(xyz: Xyz): Lab {
  const fx = labF(xyz.x / WHITE.x);
  const fy = labF(xyz.y / WHITE.y);
  const fz = labF(xyz.z / WHITE.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function rgbToLab(rgb: RGB): Lab {
  return xyzToLab(rgbToXyz(rgb));
}

export function deltaE76(lab1: Lab, lab2: Lab): number {
  return Math.hypot(lab1.l - lab2.l, lab1.a - lab2.a, lab1.b - lab2.b);
}

export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b)
  );
}

export function contrastRatio(rgb1: RGB, rgb2: RGB): number {
  const l1 = relativeLuminance(rgb1);
  const l2 = relativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
