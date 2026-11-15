// The whole match in one plain object. main.js owns the loop, bots.js and
// bomb.js read it, hud.js renders it — nobody keeps a second copy of a number
// that lives here. Money, rounds and the bomb all follow Counter-Strike-style
// rules with this game's own numbers.

// Economy: every amount is US dollars inside the fiction, not real money.
export const ECONOMY = {
  start: 800, // each player starts the match with this
  kill: 300, // per elimination
  roundWin: 3250, // every player on the winning team
  roundLoss: 1900, // every player on the losing team
  plant: 300, // the planter's team bonus, paid at plant time
  defuse: 300, // the defuser's team bonus, paid at defuse time
};

export const ROUND = {
  buySeconds: 12, // buy phase before the round starts
  roundSeconds: 100, // live round clock
  bombSeconds: 35, // fuse once the bomb is planted
  plantSeconds: 3, // hold E to plant
  defuseSeconds: 5, // hold E to defuse
  roundsToWin: 5, // first to 5 takes the match
  maxRounds: 9, // 4-4 goes to a deciding 9th round
};

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    score: { cobalt: 0, ember: 0 },
    alive: { cobalt: 5, ember: 5 },
    timer: ROUND.buySeconds,
    money: ECONOMY.start,
    kills: 0,
    deaths: 0,
    plants: 0,
    defuses: 0,
    bomb: {
      state: 'carried', // carried | planting | planted | defusing | exploded | defused
      site: null, // 'A' | 'B' | null
      progress: 0, // 0..1 while planting/defusing
      fuse: 0, // seconds left once planted
      carrier: 'player', // 'player' | bot id
    },
    roundWinner: null, // 'cobalt' | 'ember' | null
    roundReason: '', // short text for the banner, e.g. 'Bomb detonated'
    matchWinner: null,
    banner: '', // big centre text, '' hides it
    bannerSub: '',
    muted: false,
  };
}

// Pay the whole team after a round, then set up the next one. Returns the
// next phase: 'buy' while rounds remain, 'matchEnd' when someone has won.
export function awardRound(state, winner, reason) {
  state.roundWinner = winner;
  state.roundReason = reason;
  state.score[winner] += 1;
  const loser = winner === 'cobalt' ? 'ember' : 'cobalt';
  if (winner === 'cobalt') state.money += ECONOMY.roundWin;
  else state.money += ECONOMY.roundLoss;
  state.phase = 'roundEnd';
  state.timer = 4;
  state.bomb.state = 'carried';
  state.bomb.site = null;
  state.bomb.progress = 0;
  if (state.score[winner] >= ROUND.roundsToWin || state.round >= ROUND.maxRounds) {
    state.matchWinner = state.score.cobalt > state.score.ember ? 'cobalt' : 'ember';
  }
  return state.matchWinner ? 'matchEnd' : 'buy';
}

export function nextRound(state) {
  state.round += 1;
  state.phase = 'buy';
  state.timer = ROUND.buySeconds;
  state.roundWinner = null;
  state.roundReason = '';
  state.bomb.state = 'carried';
  state.bomb.site = null;
  state.bomb.progress = 0;
  state.bomb.fuse = 0;
  state.bomb.carrier = 'player';
  state.alive.cobalt = 5;
  state.alive.ember = 5;
}
