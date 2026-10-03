import type { Category, GameState, RegionId } from '../types';
import { BIZ } from './businesses';

export interface BuffSpec { label: string; mult: number; category?: Category; secs: number; all?: boolean; }
export interface Outcome {
  text: string;
  /** Cash as a multiple of the event scale S (≈ 2 minutes of your income). */
  cash?: number;
  gold?: number;
  heat?: number;
  rep?: number;
  pop?: [string, number];
  standing?: [string, number][];
  buffs?: BuffSpec[];
  freeze?: number;
  mood?: number;
  hype?: number;
  fuel?: number;
  insure?: number;
  special?: 'acceptOffer' | 'buyDiscount' | 'loseShipment' | 'exposeRival' | 'loseManager' | 'vc' | 'wageDeal';
}
export interface Choice { label: string; outcome?: Outcome; risk?: { p: number; win: Outcome; lose: Outcome }; }
export interface EventDef {
  id: string;
  region: RegionId | 'global';
  title: string;
  body: string;
  weight?: number;
  cooldown?: number;
  system?: boolean;
  cond?: (s: GameState) => boolean;
  choices: Choice[];
}

export const ownsIn = (s: GameState, regionId: RegionId, cat?: Category) =>
  Object.values(s.regions[regionId].lots).filter((l) => l.owner === 'player' && l.biz && (!cat || BIZ[l.biz].category === cat)).length;
export const ownsAny = (s: GameState, cat?: Category) =>
  (Object.keys(s.regions) as RegionId[]).reduce((n, r) => n + ownsIn(s, r, cat), 0);
const hasManager = (s: GameState) => Object.values(s.regions).some((r) => Object.values(r.lots).some((l) => l.owner === 'player' && l.manager));

const nothing = (text: string): Outcome => ({ text });

export const EVENTS: EventDef[] = [
  // ── Global ────────────────────────────────────────────────────────────────
  { id: 'taxman', region: 'global', title: 'The Tax Inspector Cometh', body: 'A grey man with a grey briefcase is asking to see "the real books".', cond: (s) => s.heat >= 40, weight: 2, choices: [
    { label: 'Pay the assessment', outcome: { text: 'Paid. The grey man smiles a grey smile.', cash: -1, heat: -20 } },
    { label: 'Argue every line', risk: { p: 0.55, win: { text: 'You out-lawyered him. He leaves with nothing.', heat: -10 }, lose: { text: 'He found the second ledger.', cash: -2.5, rep: -5 } } },
    { label: 'Lose the paperwork', outcome: { text: 'The paperwork is lost. So is his patience.', heat: 15, rep: -3 } },
  ] },
  { id: 'viral_review', region: 'global', title: 'Five Stars, No Notes', body: 'A famous food critic just called your cooking "criminally good".', cond: (s) => ownsAny(s, 'food') > 0, choices: [
    { label: 'Ride the wave', outcome: { text: 'Queues around the block.', buffs: [{ label: 'Critic\'s darling', mult: 1.5, category: 'food', secs: 180, all: true }] } },
    { label: 'Pay an influencer to amplify it', outcome: { text: 'The algorithm has blessed you.', cash: -0.5, buffs: [{ label: 'Viral food', mult: 2, category: 'food', secs: 240, all: true }] } },
  ] },
  { id: 'burst_pipe', region: 'global', title: 'Burst Pipe', body: 'Water is pouring through the ceiling of one of your businesses.', choices: [
    { label: 'Call an emergency plumber', outcome: { text: 'Fixed by lunch. Invoice by dinner.', cash: -0.6 } },
    { label: 'Mop and hope', risk: { p: 0.5, win: { text: 'The bucket held. Legend.' }, lose: { text: 'The ceiling came down. Closed for repairs.', freeze: 120 } } },
  ] },
  { id: 'gala', region: 'global', title: 'Charity Gala', body: 'Black tie, white lies and a silent auction for a very loud cause.', choices: [
    { label: 'Donate generously', outcome: { text: 'Photographed shaking all the right hands.', cash: -0.8, rep: 10 } },
    { label: 'Send your regrets', outcome: { text: 'Somebody noticed the empty chair.', rep: -2 } },
  ] },
  { id: 'investor', region: 'global', title: 'A Man in a Very Shiny Suit', body: '"Triple your money in a week. Trust me. I have a boat."', choices: [
    { label: 'Invest', risk: { p: 0.4, win: { text: 'He was legit. The boat is real too.', cash: 3 }, lose: { text: 'The boat was rented. So was he.', cash: -1, heat: 5 } } },
    { label: 'Walk away', outcome: nothing('You keep your wallet and your dignity.') },
  ] },
  { id: 'supplier', region: 'global', title: 'Supplier Price Hike', body: 'Your main supplier just raised prices twenty percent. "Inflation," they say.', choices: [
    { label: 'Eat the cost', outcome: { text: 'Margins squeezed for a while.', buffs: [{ label: 'Supplier squeeze', mult: 0.9, secs: 240, all: true }] } },
    { label: 'Switch suppliers', outcome: { text: 'New supplier, new contracts, same lunch.', cash: -0.4 } },
  ] },
  { id: 'poach', region: 'global', title: 'Poaching Season', body: 'A rival is trying to hire away one of your managers.', cond: hasManager, choices: [
    { label: 'Counter-offer', outcome: { text: 'Loyalty, purchased.', cash: -0.7, rep: 2 } },
    { label: 'Let them go', outcome: { text: 'One of your businesses is unmanaged again.', special: 'loseManager' } },
  ] },
  { id: 'lucky_safe', region: 'global', title: 'Forgotten Safe', body: 'Renovations uncovered a dusty safe behind the wall of one of your properties.', choices: [
    { label: 'Crack it open', outcome: { text: 'Old bonds, still good. Finders keepers.', cash: 1 } },
    { label: 'Hand it to the police', outcome: { text: 'The papers call you "the honest tycoon".', rep: 8, heat: -10 } },
  ] },
  { id: 'journalist', region: 'global', title: 'Journalist Digging', body: 'An investigative reporter is asking about your shipping manifests.', cond: (s) => s.heat >= 25, weight: 1.5, choices: [
    { label: 'Give an interview', risk: { p: 0.6, win: { text: 'Charming. The profile is glowing.', rep: 6, heat: -8 }, lose: { text: 'You said "allegedly" eleven times.', rep: -10, heat: 5 } } },
    { label: 'Hire a PR firm', outcome: { text: 'The story quietly dies.', cash: -0.8, heat: -12 } },
    { label: '"No comment."', outcome: { text: '"No comment" is now the headline.', heat: 6 } },
  ] },
  { id: 'star_employee', region: 'global', title: 'Star Employee', body: 'Your best shift lead has a plan to double throughput. She needs a budget.', choices: [
    { label: 'Fund the plan', outcome: { text: 'It works. Of course it works.', cash: -0.5, buffs: [{ label: 'Process overhaul', mult: 1.25, secs: 300, all: true }] } },
    { label: 'Not now', outcome: { text: 'She updates her CV.', rep: -1 } },
  ] },
  { id: 'audit', region: 'global', title: 'Audit Notice', body: 'The revenue service has selected you for a completely random audit.', cond: (s) => s.heat >= 60, weight: 3, choices: [
    { label: 'Cooperate fully', outcome: { text: 'Expensive, but clean.', cash: -1.2, heat: -25 } },
    { label: 'Stall', risk: { p: 0.5, win: { text: 'They lost interest.', heat: -5 }, lose: { text: 'They did not lose interest.', cash: -3, heat: 10 } } },
  ] },
  { id: 'raid', region: 'global', title: 'RAID', body: 'Agents with a warrant are carrying boxes out of your office.', system: true, choices: [
    { label: 'Lawyer up', outcome: { text: 'Your lawyers bill by the minute. Heat drops.', cash: -2.5, heat: -40 } },
    { label: 'Take the hit', outcome: { text: 'A business is padlocked while they dig.', freeze: 180, heat: -30, rep: -15 } },
  ] },
  { id: 'rival_offer', region: 'global', title: 'An Offer You Could Refuse', body: '{rival} wants to buy your {biz} for {price}.', system: true, choices: [
    { label: 'Sell it', outcome: { text: 'Sold. Cash in hand.', special: 'acceptOffer' } },
    { label: 'Not for sale', outcome: nothing('You show them the door.') },
  ] },
  { id: 'sabotage', region: 'global', title: 'Suspicious Fire', body: 'Your {biz} caught fire overnight. A witness saw a {rival} van nearby.', system: true, choices: [
    { label: 'Investigate', risk: { p: 0.5, win: { text: 'Proof! The scandal costs them dearly.', special: 'exposeRival', rep: 5 }, lose: { text: 'The trail went cold.', cash: -0.5, freeze: 90 } } },
    { label: 'Repair quietly', outcome: { text: 'Back open by evening.', cash: -0.6 } },
    { label: 'Do nothing', outcome: { text: 'Closed for repairs.', freeze: 150 } },
  ] },

  // ── Port Solenne ──────────────────────────────────────────────────────────
  { id: 'sol_cargo', region: 'solenne', title: 'Untaxed Cargo', body: 'A captain with a fresh scar offers a hold full of "duty-paid" silk at half price.', choices: [
    { label: 'Buy the lot', risk: { p: 0.7, win: { text: 'Resold by noon. Nobody asked.', cash: 1.5, heat: 8 }, lose: { text: 'The harbour police were waiting.', cash: -0.5, heat: 20 } } },
    { label: 'Report him', outcome: { text: 'The Dockhands appreciate a clean port.', rep: 5, standing: [['dockhands', 10]] } },
    { label: 'Not interested', outcome: nothing('He sails off to tempt someone else.') },
  ] },
  { id: 'sol_storm', region: 'solenne', title: 'Storm Front', body: 'Black clouds over the sea. Shipping will stall for a while.', choices: [
    { label: 'Secure the warehouses', outcome: { text: 'Battened down. Nothing lost.', cash: -0.6 } },
    { label: 'Risk it', risk: { p: 0.5, win: { text: 'The storm passed to the east.' }, lose: { text: 'Flooded depots. Logistics halted.', buffs: [{ label: 'Storm damage', mult: 0, category: 'logistics', secs: 150 }] } } },
  ] },
  { id: 'sol_banquet', region: 'solenne', title: 'Guild Banquet', body: 'The Old Guild invites you to dine at the Doge\'s palazzo. Dues are "expected".', choices: [
    { label: 'Attend and pay dues', outcome: { text: 'Old money nods at you. Barely.', cash: -0.7, standing: [['oldguild', 15]], pop: ['oldguild', 0.03] } },
    { label: 'Snub them', outcome: { text: 'The Old Guild has a long memory.', standing: [['oldguild', -15]] } },
  ] },
  { id: 'sol_dockstrike', region: 'solenne', title: 'Dock Strike Threat', body: 'Big Tomas says the Dockhands walk tomorrow unless there\'s a bonus.', choices: [
    { label: 'Pay the bonus', outcome: { text: 'Cranes keep swinging.', cash: -0.8, standing: [['dockhands', 10]] } },
    { label: 'Wait them out', outcome: { text: 'Half the cranes stand still.', buffs: [{ label: 'Dock slowdown', mult: 0.3, category: 'logistics', secs: 180 }] } },
    { label: 'Hire replacements', risk: { p: 0.5, win: { text: 'The scabs held the line.', heat: 3 }, lose: { text: 'Riot at the gates. Total shutdown.', rep: -10, buffs: [{ label: 'Dock riot', mult: 0, category: 'logistics', secs: 240 }] } } },
  ] },
  { id: 'sol_festival', region: 'solenne', title: 'Lighthouse Festival', body: 'Lanterns, fireworks and fifty thousand thirsty tourists.', choices: [
    { label: 'Sponsor it', outcome: { text: 'Your name lights up the harbour.', cash: -0.5, rep: 4, buffs: [{ label: 'Festival crowds', mult: 1.6, category: 'hospitality', secs: 240 }] } },
    { label: 'Just enjoy it', outcome: { text: 'Busy night anyway.', buffs: [{ label: 'Festival crowds', mult: 1.2, category: 'hospitality', secs: 240 }] } },
  ] },
  { id: 'sol_harbourmaster', region: 'solenne', title: 'New Harbour Master', body: 'The new harbour master promises a crackdown on "creative paperwork".', choices: [
    { label: 'Make friends early', outcome: { text: 'A long lunch and a firm handshake.', cash: -0.4, heat: -10 } },
    { label: 'Ignore him', outcome: { text: 'He makes a note of your name.', heat: 5 } },
  ] },
  { id: 'sol_spice', region: 'solenne', title: 'Saffron Auction', body: 'A ship from the far south is auctioning saffron by the crate.', choices: [
    { label: 'Buy in', risk: { p: 0.6, win: { text: 'Flipped to Merchant Row at triple.', cash: 2.4 }, lose: { text: 'Half of it was dyed sawdust.', cash: -1 } } },
    { label: 'Pass', outcome: nothing('Someone else gets rich. Or poor.') },
  ] },

  // ── Red Mesa ──────────────────────────────────────────────────────────────
  { id: 'rm_nephew', region: 'redmesa', title: 'The Governor\'s Nephew', body: 'Young Crane would like a "consulting fee" to keep your permits moving.', choices: [
    { label: 'Pay the fee', outcome: { text: 'Doors open. Paper trails form.', cash: -0.5, heat: 5, standing: [['circle', 15]] } },
    { label: 'Refuse', outcome: { text: 'Crane takes it personally. Cross the Circle again and your permits will crawl.', standing: [['circle', -15]] } },
  ] },
  { id: 'rm_bandits', region: 'redmesa', title: 'Bandits on Route 9', body: 'Masked riders hit a convoy last night. Your cargo is on the same road.', cond: (s) => s.shipments.length > 0, choices: [
    { label: 'Hire armed escorts', outcome: { text: 'Your trucks roll through untouched.', cash: -0.6 } },
    { label: 'Risk it', risk: { p: 0.5, win: { text: 'The bandits picked another convoy.' }, lose: { text: 'Your cargo is gone. All of it.', special: 'loseShipment' } } },
  ] },
  { id: 'rm_gusher', region: 'redmesa', title: 'Gusher!', body: 'Your survey team struck something black and bubbly near Derrick Fields.', choices: [
    { label: 'Drill', risk: { p: 0.65, win: { text: 'Black gold. Energy income doubles for a while.', buffs: [{ label: 'Gusher', mult: 2, category: 'energy', secs: 300 }] }, lose: { text: 'Dry hole. Expensive dry hole.', cash: -1 } } },
    { label: 'Sell the rights', outcome: { text: 'Crane Petroleum paid cash. Of course they did.', cash: 0.8 } },
  ] },
  { id: 'rm_dust', region: 'redmesa', title: 'Dust Storm', body: 'A wall of red dust is rolling into Dustwater.', choices: [
    { label: 'Close up and clean', outcome: { text: 'Sparkling. Briefly.', cash: -0.3 } },
    { label: 'Stay open', outcome: { text: 'Nobody shops in a sandstorm.', buffs: [{ label: 'Dust storm', mult: 0.4, category: 'retail', secs: 120 }, { label: 'Dust storm', mult: 0.4, category: 'food', secs: 120 }] } },
  ] },
  { id: 'rm_reform', region: 'redmesa', title: 'Reform Rally', body: 'Judge Park is rallying Dustwater against corruption and asked for your support.', choices: [
    { label: 'Donate to Clean Sweep', outcome: { text: 'The Governor will remember this.', cash: -0.5, pop: ['reform', 0.06], standing: [['reform', 15], ['circle', -10]] } },
    { label: 'Tip off the Governor', outcome: { text: 'The Circle owes you one. The town whispers.', rep: -6, standing: [['circle', 12]] } },
    { label: 'Stay out of it', outcome: nothing('Politics is for people without permits pending.') },
  ] },
  { id: 'rm_water', region: 'redmesa', title: 'Water Rights Auction', body: 'Out here, water is the real currency.', choices: [
    { label: 'Bid big', outcome: { text: 'You own the river. Everything grows.', cash: -1.2, buffs: [{ label: 'Water rights', mult: 1.2, secs: 600 }] } },
    { label: 'Pass', outcome: nothing('Crane wins it. Naturally.') },
  ] },
  { id: 'rm_fuel', region: 'redmesa', title: 'Fuel Price Spike', body: 'A refinery fire up north. Fuel prices are going vertical.', choices: [
    { label: 'Sell futures now', outcome: { text: 'Locked in the gain. Prices cool.', cash: 1, fuel: -0.3 } },
    { label: 'Ride the spike', risk: { p: 0.7, win: { text: 'Fuel index soars.', fuel: 0.5 }, lose: { text: 'The fire was out by morning. Prices crash.', fuel: -0.4 } } },
  ] },

  // ── Neon Vale ─────────────────────────────────────────────────────────────
  { id: 'nv_termsheet', region: 'neonvale', title: 'Term Sheet', body: 'A VC with very white sneakers offers cash now for 25 % of your Neon Vale revenue for 30 minutes.', cond: (s) => ownsIn(s, 'neonvale', 'tech') > 0 && s.regions.neonvale.vars.vcShare === 0, choices: [
    { label: 'Sign it', outcome: { text: 'Wire received. Board seat surrendered.', special: 'vc' } },
    { label: 'Bootstrap', outcome: nothing('You keep 100 % of something.') },
  ] },
  { id: 'nv_viral', region: 'neonvale', title: '#Trending', body: 'Your app hit number one overnight. The servers are melting.', cond: (s) => ownsIn(s, 'neonvale', 'tech') > 0, choices: [
    { label: 'Scale the servers', outcome: { text: 'Smooth as glass. Tech income doubles.', cash: -0.5, buffs: [{ label: 'Viral app', mult: 2, category: 'tech', secs: 300 }] } },
    { label: 'Let it ride', risk: { p: 0.7, win: { text: 'Held together with tape. Still huge.', buffs: [{ label: 'Viral app', mult: 1.4, category: 'tech', secs: 300 }] }, lose: { text: 'Outage. Angry posts. Uninstalls.', rep: -4, buffs: [{ label: 'Outage', mult: 0.7, category: 'tech', secs: 300 }] } } },
  ] },
  { id: 'nv_antitrust', region: 'neonvale', title: 'Antitrust Probe', body: 'The Fair Tech Coalition calls you "a monopoly in waiting".', cond: (s) => s.regions.neonvale.ruling === 'fairtech' && ownsIn(s, 'neonvale', 'tech') >= 3, weight: 3, choices: [
    { label: 'Settle', outcome: { text: 'Expensive peace.', cash: -1.5 } },
    { label: 'Fight it in court', risk: { p: 0.5, win: { text: 'Case dismissed.', rep: 5 }, lose: { text: 'Record fine. Front-page news.', cash: -3, rep: -10 } } },
  ] },
  { id: 'nv_rentstrike', region: 'neonvale', title: 'Rent Strike', body: 'Tenants on Neon Row refuse to pay until rents come down.', choices: [
    { label: 'Negotiate', outcome: { text: 'A fair deal. Even Housing First approves.', cash: -0.4, rep: 5, standing: [['housing', 10]] } },
    { label: 'Wait it out', outcome: { text: 'Empty rooms, angry signs.', buffs: [{ label: 'Rent strike', mult: 0.5, category: 'hospitality', secs: 240 }] } },
  ] },
  { id: 'nv_hackathon', region: 'neonvale', title: 'Hackathon', body: 'Two hundred caffeinated coders want a sponsor for the weekend.', choices: [
    { label: 'Sponsor', outcome: { text: 'Three new features and one new hire.', cash: -0.3, rep: 3, buffs: [{ label: 'Hackathon boost', mult: 1.3, category: 'tech', secs: 300 }] } },
    { label: 'Pass', outcome: nothing('Quanta sponsors it instead.') },
  ] },
  { id: 'nv_leak', region: 'neonvale', title: 'Data Leak', body: 'Customer emails turned up on a forum. Nobody has noticed. Yet.', choices: [
    { label: 'Disclose it', outcome: { text: 'Painful, but people respect it.', rep: -5, heat: -5 } },
    { label: 'Cover it up', risk: { p: 0.6, win: { text: 'It vanished into the noise.' }, lose: { text: 'The cover-up became the story.', rep: -20, heat: 15 } } },
  ] },
  { id: 'nv_flop', region: 'neonvale', title: 'Rival Product Flop', body: '{rival}\'s new gadget bricked a million phones. Their board is panicking.', system: true, choices: [
    { label: 'Lowball one of their sites ({price})', outcome: { text: 'They took the deal. Desperate times.', special: 'buyDiscount' } },
    { label: 'Pass', outcome: nothing('You watch them squirm.') },
  ] },

  // ── Amberfield ────────────────────────────────────────────────────────────
  { id: 'am_drought', region: 'amberfield', title: 'Drought Forecast', body: 'No rain for three weeks. Even the almanac looks worried.', choices: [
    { label: 'Install irrigation', outcome: { text: 'Green fields while the neighbours brown.', cash: -0.8 } },
    { label: 'Pray for rain', risk: { p: 0.5, win: { text: 'Thunder on Sunday. Saved.' }, lose: { text: 'Cracked earth. Harvest withers.', buffs: [{ label: 'Drought', mult: 0.4, category: 'agri', secs: 300 }] } } },
  ] },
  { id: 'am_bumper', region: 'amberfield', title: 'Bumper Harvest', body: 'Too much grain, too few buyers. Prices are sagging.', choices: [
    { label: 'Sell now', outcome: { text: 'Cash in before the slump.', cash: 0.8 } },
    { label: 'Store it in the silos', outcome: { text: 'Patience pays.', cash: -0.3, buffs: [{ label: 'Stored harvest', mult: 1.5, category: 'agri', secs: 300 }] } },
  ] },
  { id: 'am_fair', region: 'amberfield', title: 'County Fair', body: 'Enter your best pie for a blue ribbon. The whole county is watching.', choices: [
    { label: 'Enter the contest', risk: { p: 0.5, win: { text: 'Blue ribbon! Lines at every stall.', rep: 8, buffs: [{ label: 'Blue ribbon', mult: 1.5, category: 'food', secs: 240 }] }, lose: { text: 'June Abernathy wins again.', rep: -2 } } },
    { label: 'Just eat pie', outcome: nothing('Excellent pie.') },
  ] },
  { id: 'am_coop', region: 'amberfield', title: 'Co-op Invitation', body: 'Ma Delacroix invites you to join the Farmers\' Union co-op.', choices: [
    { label: 'Join', outcome: { text: 'Shared tractors, shared profits.', cash: -0.6, standing: [['farmers', 15]], buffs: [{ label: 'Co-op member', mult: 1.25, category: 'agri', secs: 900 }] } },
    { label: 'Decline', outcome: { text: 'The union notes your independence.', standing: [['farmers', -5]] } },
  ] },
  { id: 'am_locusts', region: 'amberfield', title: 'Locust Rumours', body: 'Old Jeb swears he saw a swarm down by the river.', choices: [
    { label: 'Fumigate', outcome: { text: 'Better safe.', cash: -0.5 } },
    { label: 'Ignore Jeb', risk: { p: 0.7, win: { text: 'Jeb was wrong. Again.' }, lose: { text: 'Jeb was right. Fields stripped.', buffs: [{ label: 'Locusts', mult: 0.3, category: 'agri', secs: 240 }] } } },
  ] },
  { id: 'am_bigbox', region: 'amberfield', title: 'Big-Box Store Coming', body: 'MegaMart wants to open on the edge of town.', choices: [
    { label: 'Lobby against it', outcome: { text: 'Main Street rallies behind you.', cash: -0.5, pop: ['mainstreet', 0.06], standing: [['mainstreet', 12]] } },
    { label: 'Invest with them', outcome: { text: 'A quick return and a lot of side-eye.', cash: 1, rep: -6, buffs: [{ label: 'MegaMart', mult: 0.8, category: 'retail', secs: 600 }] } },
  ] },
  { id: 'am_parade', region: 'amberfield', title: 'Tractor Parade', body: 'Forty tractors, one marching band, zero traffic laws.', choices: [
    { label: 'Sponsor a float', outcome: { text: 'Your float wins "Most Patriotic".', cash: -0.15, rep: 4 } },
    { label: 'Close for the afternoon', outcome: { text: 'Nobody could reach you anyway.', buffs: [{ label: 'Parade day', mult: 0.8, secs: 120 }] } },
  ] },

  // ── Isla Verano ───────────────────────────────────────────────────────────
  { id: 've_hurricane', region: 'verano', title: 'Hurricane Warning', body: 'Hurricane Delia is spinning straight toward the island.', cond: (s) => s.regions.verano.vars.insuredUntil <= s.t, weight: 1.5, choices: [
    { label: 'Buy storm insurance', outcome: { text: 'Covered for the season.', cash: -0.9, insure: 960 } },
    { label: 'Board up and pray', risk: { p: 0.55, win: { text: 'Delia turned north at the last minute.' }, lose: { text: 'Direct hit. Hotels closed, beaches gone.', buffs: [{ label: 'Hurricane damage', mult: 0, category: 'hospitality', secs: 240 }, { label: 'Hurricane damage', mult: 0.5, category: 'food', secs: 240 }] } } },
  ] },
  { id: 've_celebrity', region: 'verano', title: 'Celebrity Sighting', body: 'A pop star just landed. Paparazzi everywhere.', choices: [
    { label: 'Comp her a suite', outcome: { text: 'One selfie and you\'re booked solid.', cash: -0.3, buffs: [{ label: 'Celebrity buzz', mult: 1.8, category: 'hospitality', secs: 300 }] } },
    { label: 'Charge full price', outcome: { text: 'She paid. She did not post.', cash: 0.4 } },
  ] },
  { id: 've_audit', region: 'verano', title: 'Offshore Audit', body: 'Auditors from three regions want to visit your "brass plaque" office.', cond: (s) => s.regions.verano.vars.offshore || s.heat >= 20, weight: 2, choices: [
    { label: 'Cooperate', outcome: { text: 'Clean-ish books. Expensive accountants.', cash: -1, heat: -20 } },
    { label: 'Stall', risk: { p: 0.5, win: { text: 'Their flight home left first.', heat: -5 }, lose: { text: 'They found the second fax machine.', cash: -2.5, heat: 15 } } },
  ] },
  { id: 've_cruise', region: 'verano', title: 'Cruise Ship Docks', body: 'Four thousand tourists, six hours, wallets out.', choices: [
    { label: 'Open early, staff up', outcome: { text: 'Every till is singing.', cash: -0.2, buffs: [{ label: 'Cruise crowd', mult: 1.7, category: 'food', secs: 240 }, { label: 'Cruise crowd', mult: 1.7, category: 'retail', secs: 240 }] } },
    { label: 'Business as usual', outcome: { text: 'Still busier than normal.', buffs: [{ label: 'Cruise crowd', mult: 1.2, category: 'food', secs: 240 }] } },
  ] },
  { id: 've_reef', region: 'verano', title: 'Reef Protection Bill', body: 'Green Isles want to ban new construction near the reef.', choices: [
    { label: 'Back the bill', outcome: { text: 'Divers and voters love you.', rep: 8, pop: ['green', 0.06], standing: [['green', 12]] } },
    { label: 'Quietly fund the opposition', outcome: { text: 'The Tourism Board owes you.', cash: -0.4, pop: ['tourism', 0.05], standing: [['tourism', 10]] } },
  ] },
  { id: 've_rum', region: 'verano', title: 'Rum Runners', body: 'Smugglers want to rent your back room. Cash, no questions.', choices: [
    { label: 'Take the cash', outcome: { text: 'Easy money. Heavy heat.', cash: 1.5, heat: 15 } },
    { label: 'Refuse', outcome: nothing('They try the next door down.') },
    { label: 'Tip off the police', outcome: { text: 'The chief owes you a favour.', rep: 6, heat: -5 } },
  ] },
  { id: 've_lowseason', region: 'verano', title: 'Low-Season Blues', body: 'The beaches are empty and the hotel managers are restless.', cond: (s) => Math.floor(s.t / 480) % 2 === 1, choices: [
    { label: 'Run a promo', outcome: { text: 'Discount tourists are still tourists.', cash: -0.4, buffs: [{ label: 'Off-season promo', mult: 1.4, category: 'hospitality', secs: 300 }] } },
    { label: 'Tighten belts', outcome: nothing('You wait for the sun to sell itself again.') },
  ] },

  // ── Ironhold ──────────────────────────────────────────────────────────────
  { id: 'ih_raise', region: 'ironhold', title: 'Union Demands a Raise', body: 'Katya Brandt slaps a list of demands on your desk.', cond: (s) => ownsIn(s, 'ironhold') > 0, weight: 1.5, choices: [
    { label: 'Accept', outcome: { text: 'Wages up 5 %. The union cheers.', mood: 25, special: 'wageDeal' } },
    { label: 'Negotiate', risk: { p: 0.6, win: { text: 'A fair compromise.', mood: 10 }, lose: { text: 'Talks collapse. Grumbling on the floor.', mood: -15 } } },
    { label: 'Refuse', outcome: { text: 'Katya walks out. The mood sours.', mood: -20 } },
  ] },
  { id: 'ih_tariffwar', region: 'ironhold', title: 'Steel Tariff War', body: 'Other regions slapped retaliatory tariffs on Ironhold steel.', choices: [
    { label: 'Lobby for an exemption', outcome: { text: 'Exempted. Your mills hum.', cash: -0.8, buffs: [{ label: 'Tariff exemption', mult: 1.15, category: 'industry', secs: 600 }] } },
    { label: 'Ride it out', outcome: { text: 'Orders dip for a while.', buffs: [{ label: 'Retaliation tariffs', mult: 0.85, category: 'industry', secs: 300 }] } },
  ] },
  { id: 'ih_accident', region: 'ironhold', title: 'Factory Accident', body: 'A press failed at the foundry. Nobody died — this time.', choices: [
    { label: 'Pay compensation', outcome: { text: 'The right thing, and the union noticed.', cash: -0.8, rep: 3, mood: 10 } },
    { label: 'Lawyer up', outcome: { text: 'Legally fine. Morally… the union noticed.', rep: -10, mood: -15, heat: 5 } },
  ] },
  { id: 'ih_blizzard', region: 'ironhold', title: 'Blizzard', body: 'Two metres of snow overnight. Pipes are freezing.', choices: [
    { label: 'Pay for heating', outcome: { text: 'Warm and open.', cash: -0.4 } },
    { label: 'Close for the day', outcome: { text: 'The city sleeps under snow.', buffs: [{ label: 'Blizzard', mult: 0.6, secs: 240 }] } },
  ] },
  { id: 'ih_scrap', region: 'ironhold', title: 'Old Foundry Auction', body: 'A bankrupt foundry is selling machines at scrap prices.', choices: [
    { label: 'Buy the machines', outcome: { text: 'Old iron, new profits.', cash: -0.6, buffs: [{ label: 'Cheap machinery', mult: 1.3, category: 'industry', secs: 600 }] } },
    { label: 'Pass', outcome: nothing('Krauss buys them instead.') },
  ] },
  { id: 'ih_coal', region: 'ironhold', title: 'Coal Shortage', body: 'The rail line from the mines is snowed in.', choices: [
    { label: 'Stockpile at any price', outcome: { text: 'Furnaces stay lit.', cash: -0.5 } },
    { label: 'Ration energy', outcome: { text: 'Half-speed production.', buffs: [{ label: 'Rationing', mult: 0.7, category: 'industry', secs: 300 }] } },
  ] },
  { id: 'ih_choir', region: 'ironhold', title: 'Workers\' Choir Festival', body: 'The union choir needs a sponsor for its winter concert.', choices: [
    { label: 'Sponsor', outcome: { text: 'Four-part harmony in your honour.', cash: -0.2, mood: 12, rep: 4 } },
    { label: 'Decline', outcome: { text: 'They sing anyway. Pointedly.', mood: -3 } },
  ] },
];

export const EVENT: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
