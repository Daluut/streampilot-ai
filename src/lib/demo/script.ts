// Synthetic chat for Demo mode. Every username and message is invented for this demo and
// does not come from any real channel or viewer. The scenario is a boss fight with
// repeated questions, technical reports, suggestions, mixed reactions and a topic change.

export const DEMO_CHANNEL = "demo-boss-run";

export interface DemoScriptLine {
  username: string;
  text: string;
  broadcaster?: boolean;
}

export const DEMO_SCRIPT: readonly DemoScriptLine[] = [
  { username: "nightowl_kai", text: "ok the boss is finally here lets goo" },
  { username: "pixie_rain", text: "what weapon are you using rn?" },
  { username: "tomo_plays", text: "which sword is that? looks sick" },
  { username: "cinder_fox", text: "is that the crossbow or the sword??" },
  { username: "velvet_moth", text: "lol the intro cutscene was so long" },
  { username: "demo_host", text: "Weapon is the sword for melee, crossbow for the flying phases.", broadcaster: true },
  { username: "sable_dev", text: "anyone know what build u running?" },
  { username: "quiet_otter", text: "nice, that explains the crossbow bolts earlier" },
  { username: "byte_bard", text: "should try the shield parry instead of dodging" },
  { username: "rookie_ren", text: "dodge is more reliable tbh, you should just dodge" },
  { username: "maple_jun", text: "what gear do you have on, the armor looks new?" },
  { username: "lumen_sky", text: "your stream keeps lagging for me and the audio cut out" },
  { username: "hexdrift", text: "audio is fine on my end" },
  { username: "ember_mo", text: "this boss is so unfair, the fire breath one-shots me" },
  { username: "saltcracker", text: "rigged fight honestly, cheap hits everywhere" },
  { username: "demo_host", text: "Fire breath is rough. The audio issue is on my mic side, checking it now.", broadcaster: true },
  { username: "glitchkin", text: "poggers that was clean" },
  { username: "pixie_rain", text: "still wondering, which weapon do you recommend for a new player?" },
  { username: "tomo_plays", text: "whats the weapon in ur hand called" },
  { username: "cinder_fox", text: "which weapon should a new player start with" },
  { username: "nightowl_kai", text: "what armor is that set again" },
  { username: "velvet_moth", text: "that heal was clutch, love this fight" },
  { username: "sable_dev", text: "is phase two coming soon?" },
  { username: "quiet_otter", text: "phase two is the adds one, watch the left side" },
  { username: "byte_bard", text: "maybe use a different upgrade path for the crossbow, more damage" },
  { username: "rookie_ren", text: "lol i died again to the fire breath" },
  { username: "ember_mo", text: "ugh this is frustrating, not fun anymore" },
  { username: "maple_jun", text: "dont give up, you got this" },
  { username: "demo_host", text: "Phase two is next. The crossbow upgrade path is what I am testing today.", broadcaster: true },
  { username: "lumen_sky", text: "still lagging on my end, can u lower the stream quality?" },
  { username: "glitchkin", text: "stream quality looks fine here" },
  { username: "hexdrift", text: "is this a new boss or a remake of the old one?" },
  { username: "saltcracker", text: "wtf that phase was cheap" },
  { username: "pixie_rain", text: "which weapon did you use for phase two?" },
  { username: "cinder_fox", text: "lol the adds spawn everywhere" },
  { username: "quiet_otter", text: "not that bad honestly, once u learn the pattern it's clean" },
  { username: "byte_bard", text: "try the shield parry on the adds, should help" },
  { username: "velvet_moth", text: "congrats on the progress, nearly there" },
  { username: "sable_dev", text: "what weapon do you swap to for the final phase?" },
  { username: "demo_host", text: "Final phase: sword for the adds, crossbow for the core. Let's go.", broadcaster: true },
  { username: "nightowl_kai", text: "gg incoming, insane fight" },
  { username: "tomo_plays", text: "is the armor from the event or the shop?" },
  { username: "rookie_ren", text: "pog pog pog finally" },
  { username: "ember_mo", text: "not gonna lie this boss is awful but the music is great" },
  { username: "maple_jun", text: "anyone else think the audio is too quiet?" },
  { username: "hexdrift", text: "audio is fine for me" },
  { username: "lumen_sky", text: "what's the fps cap you're using?" },
  { username: "demo_host", text: "Locked at 60 fps. Audio levels are adjusted, thanks for flagging.", broadcaster: true },
  { username: "glitchkin", text: "the boss lost, gg chat" },
  { username: "pixie_rain", text: "which weapon should I buy first in the shop?" },
  { username: "velvet_moth", text: "pizza anyone? my stomach is growling" },
  { username: "byte_bard", text: "off topic but who else is watching the other stream tonight" },
  { username: "quiet_otter", text: "lol pizza sounds good" },
  { username: "sable_dev", text: "what time is the next stream?" },
  { username: "demo_host", text: "Next stream is Friday. Thanks for the amazing run tonight!", broadcaster: true },
  { username: "cinder_fox", text: "gg everyone, see you friday" },
];
