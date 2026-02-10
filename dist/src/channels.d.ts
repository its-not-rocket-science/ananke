export declare enum DamageChannel {
    Kinetic = 0,
    Thermal = 1,
    Electrical = 2,
    Chemical = 3,
    Radiation = 4,
    Corrosive = 5,
    Suffocation = 6,
    ControlDisruption = 7
}
export type ChannelMask = number;
export declare const channelMask: (...chs: DamageChannel[]) => ChannelMask;
export declare const hasChannel: (mask: ChannelMask, ch: DamageChannel) => boolean;
