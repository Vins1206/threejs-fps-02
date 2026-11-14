// Match state, kept in one place. main.js owns the round flow; every module
// reads and writes through this object, never through a second copy of it.
// Phases: 'menu' -> 'buy' (12 s, shop open) -> 'live' -> 'roundEnd' -> 'buy' ...
// First to 5 rounds takes the match (max 9). The player attacks: win a round by
// eliminating all four defenders, or by planting the spike and letting it blow.
export const ROUND_TIME = 100;
export const BUY_TIME = 12;
export const PLANT_TIME = 3.0;
export const FUSE_TIME = 30;
export const DEFUSE_TIME = 4.0;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createMatch() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    wins: 0, // Ember (player) rounds
    losses: 0, // Slate (bots) rounds
    money: 800,
    kills: 0,
    deaths: 0,
    plants: 0,
    timer: BUY_TIME,
    spike: 'carried', // carried | planting | planted | defused | detonated
    plantProgress: 0,
    defuseProgress: 0,
    spikeSite: null, // 'A' | 'B'
    spikePos: null, // { x, z } once planted
    roundWinner: null, // 'ember' | 'slate'
    roundReason: '',
    matchWinner: null,
    feed: [], // { text, good } newest first, max 5
    time: 0, // match clock, fixed-step seconds
  };
}

export function addFeed(match, text, good) {
  match.feed.unshift({ text, good: !!good });
  if (match.feed.length > 5) match.feed.length = 5;
}

export function scoreRound(match, winner, reason) {
  match.roundWinner = winner;
  match.roundReason = reason;
  match.phase = 'roundEnd';
  match.timer = 5;
  if (winner === 'ember') {
    match.wins += 1;
    match.money += 1400;
  } else {
    match.losses += 1;
    match.money += 900;
  }
  if (match.wins >= WIN_ROUNDS || match.losses >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
    match.matchWinner = match.wins > match.losses ? 'ember' : 'slate';
  }
}

export function nextRound(match) {
  match.round += 1;
  match.phase = 'buy';
  match.timer = BUY_TIME;
  match.spike = 'carried';
  match.plantProgress = 0;
  match.defuseProgress = 0;
  match.spikeSite = null;
  match.spikePos = null;
  match.roundWinner = null;
  match.roundReason = '';
}
