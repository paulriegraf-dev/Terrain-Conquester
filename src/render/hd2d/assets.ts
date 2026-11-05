/** HD-2D-Bilder (05.11.): werden beim Bauen als Data-URL eingebettet (esbuild-Loader für .png). */
import u_battery from '../../../assets/sprites/units/battery.png';
import u_bomber from '../../../assets/sprites/units/bomber.png';
import u_breaker from '../../../assets/sprites/units/breaker.png';
import u_catapult from '../../../assets/sprites/units/catapult.png';
import u_colossus from '../../../assets/sprites/units/colossus.png';
import u_commander from '../../../assets/sprites/units/commander.png';
import u_drone from '../../../assets/sprites/units/drone.png';
import u_gunner from '../../../assets/sprites/units/gunner.png';
import u_hound from '../../../assets/sprites/units/hound.png';
import u_hoverscout from '../../../assets/sprites/units/hoverscout.png';
import u_landformer from '../../../assets/sprites/units/landformer.png';
import u_mudling from '../../../assets/sprites/units/mudling.png';
import u_myrcannon from '../../../assets/sprites/units/myrcannon.png';
import u_nanomedic from '../../../assets/sprites/units/nanomedic.png';
import u_plasma from '../../../assets/sprites/units/plasma.png';
import u_sniper from '../../../assets/sprites/units/sniper.png';
import u_specialForest from '../../../assets/sprites/units/specialForest.png';
import u_specialMeadow from '../../../assets/sprites/units/specialMeadow.png';
import u_specialMud from '../../../assets/sprites/units/specialMud.png';
import u_specialRubble from '../../../assets/sprites/units/specialRubble.png';
import u_specialSnow from '../../../assets/sprites/units/specialSnow.png';
import u_sphere from '../../../assets/sprites/units/sphere.png';
import u_swarmmind from '../../../assets/sprites/units/swarmmind.png';
import u_taunter from '../../../assets/sprites/units/taunter.png';
import u_terraformer from '../../../assets/sprites/units/terraformer.png';
import u_wardForest from '../../../assets/sprites/units/wardForest.png';
import u_wardMeadow from '../../../assets/sprites/units/wardMeadow.png';
import u_wardMud from '../../../assets/sprites/units/wardMud.png';
import u_wardRubble from '../../../assets/sprites/units/wardRubble.png';
import u_wardSnow from '../../../assets/sprites/units/wardSnow.png';
import tiles1 from '../../../assets/hd2d/tiles1.png';
import tiles2_atlas from '../../../assets/hd2d/tiles2_atlas.png';
import tiles3 from '../../../assets/hd2d/tiles3.png';
import buildings from '../../../assets/hd2d/buildings.png';

export const UNIT_SHEETS: Readonly<Record<string, string>> = {
  'units/battery.png': u_battery,
  'units/bomber.png': u_bomber,
  'units/breaker.png': u_breaker,
  'units/catapult.png': u_catapult,
  'units/colossus.png': u_colossus,
  'units/commander.png': u_commander,
  'units/drone.png': u_drone,
  'units/gunner.png': u_gunner,
  'units/hound.png': u_hound,
  'units/hoverscout.png': u_hoverscout,
  'units/landformer.png': u_landformer,
  'units/mudling.png': u_mudling,
  'units/myrcannon.png': u_myrcannon,
  'units/nanomedic.png': u_nanomedic,
  'units/plasma.png': u_plasma,
  'units/sniper.png': u_sniper,
  'units/specialForest.png': u_specialForest,
  'units/specialMeadow.png': u_specialMeadow,
  'units/specialMud.png': u_specialMud,
  'units/specialRubble.png': u_specialRubble,
  'units/specialSnow.png': u_specialSnow,
  'units/sphere.png': u_sphere,
  'units/swarmmind.png': u_swarmmind,
  'units/taunter.png': u_taunter,
  'units/terraformer.png': u_terraformer,
  'units/wardForest.png': u_wardForest,
  'units/wardMeadow.png': u_wardMeadow,
  'units/wardMud.png': u_wardMud,
  'units/wardRubble.png': u_wardRubble,
  'units/wardSnow.png': u_wardSnow,
};
export const TILESETS = { tiles1, tiles2: tiles2_atlas, tiles3 } as const;
/** Gebäude-Streifen (je 80 px): tcHQ, myrHQ, tfHQ, Kaserne, Hangar, Schwerwerk, Brut, Werkstatt, Schmelze, Wiesenhof, Hain, Schlammgrube, Frosthalle, Steinbruch. */
export const BUILDINGS_SHEET = buildings;
