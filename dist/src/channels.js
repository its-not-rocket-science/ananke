export var DamageChannel;
(function (DamageChannel) {
    DamageChannel[DamageChannel["Kinetic"] = 0] = "Kinetic";
    DamageChannel[DamageChannel["Thermal"] = 1] = "Thermal";
    DamageChannel[DamageChannel["Electrical"] = 2] = "Electrical";
    DamageChannel[DamageChannel["Chemical"] = 3] = "Chemical";
    DamageChannel[DamageChannel["Radiation"] = 4] = "Radiation";
    DamageChannel[DamageChannel["Corrosive"] = 5] = "Corrosive";
    DamageChannel[DamageChannel["Suffocation"] = 6] = "Suffocation";
    DamageChannel[DamageChannel["ControlDisruption"] = 7] = "ControlDisruption";
})(DamageChannel || (DamageChannel = {}));
export const channelMask = (...chs) => {
    let m = 0;
    for (const c of chs)
        m |= (1 << c);
    return m;
};
export const hasChannel = (mask, ch) => (mask & (1 << ch)) !== 0;
