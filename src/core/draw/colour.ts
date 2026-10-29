const CHANNEL_OFFSETS_IN_HEX = [1, 3, 5];
const HEX = 16;

export const rgbChannels = (hex: string): number[] => CHANNEL_OFFSETS_IN_HEX.map((offset) => parseInt(hex.slice(offset, offset + 2), HEX));

const hexChannel = (channel: number): string => Math.round(channel).toString(HEX).padStart(2, "0");

export function mix(from: string, to: string, fraction: number): string {
  const [fromChannels, toChannels] = [rgbChannels(from), rgbChannels(to)];
  return `#${fromChannels.map((channel, index) => hexChannel(channel + (toChannels[index] - channel) * fraction)).join("")}`;
}
