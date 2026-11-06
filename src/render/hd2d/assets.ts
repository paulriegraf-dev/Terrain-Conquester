/** HD-2D-Bilder (05.11.): werden beim Bauen als Data-URL eingebettet (esbuild-Loader für .png/.webp; Sheets verlustfrei als WebP). */
import u_battery from '../../../assets/sprites/units/battery.webp';
import o_battery from '../../../assets/sprites/units/old_battery.png';
import o_colossus from '../../../assets/sprites/units/old_colossus.png';
import o_commander from '../../../assets/sprites/units/old_commander.png';
import o_gunner from '../../../assets/sprites/units/old_gunner.png';
import o_nanomedic from '../../../assets/sprites/units/old_nanomedic.png';
import o_hoverscout from '../../../assets/sprites/units/old_hoverscout.png';
import o_plasma from '../../../assets/sprites/units/old_plasma.png';
import o_sniper from '../../../assets/sprites/units/old_sniper.png';
import u_bomber from '../../../assets/sprites/units/bomber.webp';
import u_breaker from '../../../assets/sprites/units/breaker.webp';
import u_catapult from '../../../assets/sprites/units/catapult.webp';
import u_colossus from '../../../assets/sprites/units/colossus.webp';
import u_commander from '../../../assets/sprites/units/commander.webp';
import u_drone from '../../../assets/sprites/units/drone.webp';
import u_gunner from '../../../assets/sprites/units/gunner.webp';
import u_hound from '../../../assets/sprites/units/hound.webp';
import u_hoverscout from '../../../assets/sprites/units/hoverscout.webp';
import u_landformer from '../../../assets/sprites/units/landformer.webp';
import u_mudling from '../../../assets/sprites/units/mudling.webp';
import u_myrcannon from '../../../assets/sprites/units/myrcannon.webp';
import u_nanomedic from '../../../assets/sprites/units/nanomedic.webp';
import u_plasma from '../../../assets/sprites/units/plasma.webp';
import u_sniper from '../../../assets/sprites/units/sniper.webp';
import u_specialForest from '../../../assets/sprites/units/specialForest.webp';
import u_specialMeadow from '../../../assets/sprites/units/specialMeadow.webp';
import u_specialMud from '../../../assets/sprites/units/specialMud.webp';
import u_specialRubble from '../../../assets/sprites/units/specialRubble.webp';
import u_specialSnow from '../../../assets/sprites/units/specialSnow.webp';
import u_sphere from '../../../assets/sprites/units/sphere.webp';
import u_swarmmind from '../../../assets/sprites/units/swarmmind.webp';
import u_taunter from '../../../assets/sprites/units/taunter.webp';
import u_terraformer from '../../../assets/sprites/units/terraformer.webp';
import u_wardForest from '../../../assets/sprites/units/wardForest.webp';
import u_wardMeadow from '../../../assets/sprites/units/wardMeadow.webp';
import u_wardMud from '../../../assets/sprites/units/wardMud.webp';
import u_wardRubble from '../../../assets/sprites/units/wardRubble.webp';
import u_wardSnow from '../../../assets/sprites/units/wardSnow.webp';
import tiles1 from '../../../assets/hd2d/tiles1.webp';
import tiles2_atlas from '../../../assets/hd2d/tiles2_atlas.webp';
import tiles3 from '../../../assets/hd2d/tiles3.webp';
import buildings from '../../../assets/hd2d/buildings.webp';

export const UNIT_SHEETS: Readonly<Record<string, string>> = {
  // Mock-up 2 (06.11.): alte, schlichte Technoclan-Figuren (32 px) mit einfacher Pixel-Animation
  'units/old_battery.png': o_battery,
  'units/old_colossus.png': o_colossus,
  'units/old_commander.png': o_commander,
  'units/old_gunner.png': o_gunner,
  'units/old_nanomedic.png': o_nanomedic,
  'units/old_hoverscout.png': o_hoverscout,
  'units/old_plasma.png': o_plasma,
  'units/old_sniper.png': o_sniper,
  'units/battery.webp': u_battery,
  'units/bomber.webp': u_bomber,
  'units/breaker.webp': u_breaker,
  'units/catapult.webp': u_catapult,
  'units/colossus.webp': u_colossus,
  'units/commander.webp': u_commander,
  'units/drone.webp': u_drone,
  'units/gunner.webp': u_gunner,
  'units/hound.webp': u_hound,
  'units/hoverscout.webp': u_hoverscout,
  'units/landformer.webp': u_landformer,
  'units/mudling.webp': u_mudling,
  'units/myrcannon.webp': u_myrcannon,
  'units/nanomedic.webp': u_nanomedic,
  'units/plasma.webp': u_plasma,
  'units/sniper.webp': u_sniper,
  'units/specialForest.webp': u_specialForest,
  'units/specialMeadow.webp': u_specialMeadow,
  'units/specialMud.webp': u_specialMud,
  'units/specialRubble.webp': u_specialRubble,
  'units/specialSnow.webp': u_specialSnow,
  'units/sphere.webp': u_sphere,
  'units/swarmmind.webp': u_swarmmind,
  'units/taunter.webp': u_taunter,
  'units/terraformer.webp': u_terraformer,
  'units/wardForest.webp': u_wardForest,
  'units/wardMeadow.webp': u_wardMeadow,
  'units/wardMud.webp': u_wardMud,
  'units/wardRubble.webp': u_wardRubble,
  'units/wardSnow.webp': u_wardSnow,
};
export const TILESETS = { tiles1, tiles2: tiles2_atlas, tiles3 } as const;
/** Gebäude-Streifen (je 80 px): tcHQ, myrHQ, tfHQ, Kaserne, Hangar, Schwerwerk, Brut, Werkstatt, Schmelze, Wiesenhof, Hain, Schlammgrube, Frosthalle, Steinbruch. */
export const BUILDINGS_SHEET = buildings;
