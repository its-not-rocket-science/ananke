export enum DamageChannel {
  Kinetic = 0,
  Thermal = 1,
  Electrical = 2,
  Chemical = 3,
  Radiation = 4,
  Corrosive = 5,
  Suffocation = 6,
  ControlDisruption = 7,
}

export type ChannelMask = number;

export const channelMask = (...chs: DamageChannel[]): ChannelMask => {
  let m = 0;
  for (const c of chs) m |= (1 << c);
  return m;
};

export const hasChannel = (mask: ChannelMask, ch: DamageChannel): boolean =>
  (mask & (1 << ch)) !== 0;
