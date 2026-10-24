import { BUILDINGS } from '../../data/buildings';
import { energyCap } from './economy';
import type { BuildingId } from '../../data/buildings';
import type { Command, CommandResult } from '../commands';
import { checkBuild } from '../placement';
import { zoneAt } from '../map';
import type { Entity } from '../entity';
import type { PlayerId } from '../types';
import { ROUTES } from '../types';
import type { World } from '../world';
import { STANCES } from '../world';
import { buyHero, setHeroMode, setHeroRoute } from './hero';
import { prepTerrain } from './prep';
import { castWall, swapTerrain } from './abilities';
import { DISGUISE } from '../../data/abilities';
import { placeOrder } from './market';
import { levelUp, rushOrder, rushRoute, selectUnit, startResearch } from './factory';
import { triggerEmergency } from './emergency';
import { orderScout } from './scout';
import { routeChangeSeconds } from './sites';
import { buyHqUpgrade, disguiseFactor } from './hq';
import { HQ_PATH_IDS } from '../../data/hq';

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

/**
 * Führt einen Befehl aus – oder lehnt ihn ab. Befehle können später auch übers
 * Netzwerk kommen, deshalb wird hier alles geprüft und nichts vorausgesetzt.
 */
export function applyCommand(world: World, player: PlayerId, cmd: Command): CommandResult {
  const result = execute(world, player, cmd);
  if (!result.ok) world.emit({ type: 'rejected', owner: player, reason: result.reason });
  return result;
}

function execute(world: World, player: PlayerId, cmd: Command): CommandResult {
  switch (cmd.type) {
    case 'build':
      return build(world, player, cmd.x, cmd.y, cmd.building);
    case 'sell': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      const def = BUILDINGS[b.defId as BuildingId];
      const p = world.players[player];
      const paid = b.paid ?? def.buildCost;
      p.energy = Math.min(energyCap(world, player), p.energy + Math.floor(paid * world.rules.sellRefund));
      world.destroy(b, null);
      world.emit({ type: 'sold', owner: player, name: b.name });
      return OK;
    }
    case 'setRoute': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      if (!ROUTES.includes(cmd.route)) return fail('Unbekannte Route');
      const pr = b.producer!;
      if (pr.produced === 0) {
        // Noch keine Truppe losgeschickt: Der erste Marschbefehl greift sofort.
        pr.route = cmd.route;
        pr.pendingRoute = null;
      } else if (cmd.route === pr.route) {
        pr.pendingRoute = null; // zurück zum alten Befehl = Umstellung abbrechen
      } else if (cmd.route !== pr.pendingRoute) {
        pr.pendingRoute = cmd.route;
        pr.routeChangeTick = world.tick + Math.round(routeChangeSeconds(world, player) * world.tps);
      }
      return OK;
    }
    case 'rushRoute': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      return rushRoute(world, b);
    }
    case 'rushOrder': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      return rushOrder(world, b);
    }
    case 'disguise': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      if (!BUILDINGS[cmd.as] || !ROUTES.includes(cmd.route)) return fail('Ungültige Tarnung');
      const p = world.players[player];
      if (p.energy < DISGUISE.cost) return fail(`Zu wenig Energie (${DISGUISE.cost} nötig)`);
      p.energy -= DISGUISE.cost;
      p.stats.energySpent += DISGUISE.cost;
      p.stats.disguises++;
      b.disguise = { as: cmd.as, route: cmd.route, until: world.tick + Math.round(DISGUISE.duration * disguiseFactor(world, player) * world.tps) };
      return OK;
    }
    case 'setPaused': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      b.producer!.paused = cmd.paused;
      return OK;
    }
    case 'selectUnit': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      return selectUnit(world, b, cmd.unit);
    }
    case 'upgradeFactory': {
      const b = ownBuilding(world, player, cmd.entityId);
      if (typeof b === 'string') return fail(b);
      return levelUp(world, b);
    }
    case 'research':
      // Seit 24.10. zentral: die Fabrik-ID ist nur noch ein Hinweis aus alten Replays.
      return startResearch(world, player, cmd.upgrade);
    case 'hqUpgrade':
      if (!HQ_PATH_IDS.includes(cmd.path)) return fail('Unbekannter HQ-Zweig');
      return buyHqUpgrade(world, player, cmd.path);
    case 'setStance': {
      if (!ROUTES.includes(cmd.route) || !STANCES.includes(cmd.stance)) return fail('Ungültige Haltung');
      const p = world.players[player];
      if (cmd.stance === p.stance[cmd.route]) p.pendingStance[cmd.route] = null; // zurück = Umstellung abbrechen
      else if (p.pendingStance[cmd.route]?.stance !== cmd.stance) {
        p.pendingStance[cmd.route] = { stance: cmd.stance, tick: world.tick + Math.round(world.rules.front.stanceChangeSeconds * world.tps) };
      }
      return OK;
    }
    case 'prepTerrain':
      return prepTerrain(world, player, cmd.x, cmd.y, cmd.terrain);
    case 'buyHero':
      if (!ROUTES.includes(cmd.route)) return fail('Ungültige Route');
      return buyHero(world, player, cmd.route);
    case 'heroRoute':
      if (!ROUTES.includes(cmd.route)) return fail('Ungültige Route');
      return setHeroRoute(world, player, cmd.route);
    case 'heroMode':
      if (cmd.mode !== 'gather' && cmd.mode !== 'strike') return fail('Ungültiger Befehl');
      return setHeroMode(world, player, cmd.mode);
    case 'emergency':
      return triggerEmergency(world, player);
    case 'scout':
      return orderScout(world, player);
    case 'castWall':
      return castWall(world, player, cmd.x, cmd.y, cmd.vertical);
    case 'swapTerrain':
      return swapTerrain(world, player, cmd.x, cmd.y, cmd.terrain, cmd.vertical ?? true);
    case 'order': {
      const reason = placeOrder(world, player, cmd.part);
      return reason ? fail(reason) : OK;
    }
  }
}

function build(world: World, player: PlayerId, x: number, y: number, buildingId: BuildingId): CommandResult {
  const def = BUILDINGS[buildingId];
  if (!def) return fail('Unbekanntes Gebäude');
  const check = checkBuild(world, player, x, y, def);
  if (!check.ok) return fail(check.reason);
  const p = world.players[player];
  const cost = check.cost.total;
  p.energy -= cost;
  p.stats.energySpent += cost;
  p.stats.buildingsBuilt++;
  world.addBuilding(player, def, check.rect, { paid: cost, outpost: check.outpost });
  world.emit({
    type: 'built',
    owner: player,
    name: world.players[player].faction.buildings[buildingId]!.name,
    zone: zoneAt(world.map.height, check.rect.y + check.rect.h / 2),
    outpost: check.outpost !== null,
  });
  return OK;
}

function ownBuilding(world: World, player: PlayerId, id: number): Entity | string {
  const e = world.get(id);
  if (!e || !e.alive || e.kind !== 'building' || !e.producer) return 'Gebäude nicht gefunden';
  if (e.owner !== player) return 'Nicht dein Gebäude';
  return e;
}
