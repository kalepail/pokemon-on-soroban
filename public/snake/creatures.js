// Creatures — Stellar icon-based monsters
// Each creature references an icon by index in Icons.svg (vx, vy, size from manifest)

(function(){
const CREATURES = [
  { id: "wallit",    name: "WALLIT",    iconIdx: 0,  type: "STORE",  hp: 22, atk: 7,  desc: "A pouch-mon. Hoards small bright things in its sack." },
  { id: "chainling", name: "CHAINLNG",  iconIdx: 1,  type: "CRYST",  hp: 28, atk: 9,  desc: "Links arms with others to form unbreakable chains." },
  { id: "bytebud",   name: "BYTEBUD",   iconIdx: 3,  type: "TECH",   hp: 24, atk: 8,  desc: "Lives inside warm laptops. Glows when you open the lid." },
  { id: "spyclops",  name: "SPYCLOPS",  iconIdx: 4,  type: "PSYCH",  hp: 20, atk: 11, desc: "One enormous eye. Sees through all illusions." },
  { id: "globee",    name: "GLOBEE",    iconIdx: 5,  type: "AIR",    hp: 26, atk: 9,  desc: "Roams the upper atmosphere in giant lazy arcs." },
  { id: "lockjaw",   name: "LOCKJAW",   iconIdx: 6,  type: "IRON",   hp: 30, atk: 8,  desc: "Bites down hard. Even Sparko cannot pick its grip." },
  { id: "brainz",    name: "BRAINZ",    iconIdx: 9,  type: "PSYCH",  hp: 22, atk: 13, desc: "Thinks 18 thoughts at once. None of them are about you." },
  { id: "lumes",     name: "LUMES",     iconIdx: 10, type: "COIN",   hp: 18, atk: 10, desc: "A flock of coins that moves as one shimmering body." },
  { id: "skybank",   name: "SKYBANK",   iconIdx: 13, type: "IRON",   hp: 36, atk: 7,  desc: "A walking skyscraper. Each window is a tiny apartment." },
  { id: "sparko",    name: "SPARKO",    iconIdx: 46, type: "ELEC",   hp: 20, atk: 14, customSprite: "sparko", desc: "Flickers on and off when it's thinking really hard." },
  { id: "balloono",  name: "BALLOONO",  iconIdx: 47, type: "AIR",    hp: 18, atk: 8,  desc: "Drifts. If you pop it, it just laughs and reforms." },
  { id: "puffnet",   name: "PUFFNET",   iconIdx: 37, type: "AIR",    hp: 22, atk: 9,  desc: "A cloud with antennae. Broadcasts vibes." },
  { id: "targetron", name: "TARGTRON",  iconIdx: 45, type: "STEEL",  hp: 25, atk: 11, desc: "Cannot miss. Has never missed. Will not miss." },
  { id: "envelo",    name: "ENVELO",    iconIdx: 48, type: "PAPER",  hp: 16, atk: 6,  desc: "A folded letter that walks on its own. Refuses to be read." },
  { id: "vialix",    name: "VIALIX",    iconIdx: 50, type: "TOXIC",  hp: 22, atk: 12, desc: "Two test tubes joined at the hip. Bubbles when annoyed." },
  { id: "pyrox",     name: "PYROX",     iconIdx: 59, type: "FIRE",   hp: 24, atk: 14, desc: "A small grumpy flame. Heats up when ignored." },
  { id: "nuftnft",   name: "NUFTNFT",   iconIdx: 56, type: "ART",    hp: 22, atk: 10, desc: "Each one is one-of-a-kind, even if you have several." },
  { id: "growling",  name: "GROWLING",  iconIdx: 35, type: "GRASS",  hp: 26, atk: 9,  desc: "Sprouts a new leaf every morning. Eats sunlight." },
  { id: "minted",    name: "MINTED",    iconIdx: 22, type: "COIN",   hp: 20, atk: 10, desc: "Fresh from the press. Smells of zinc and possibility." },
  { id: "swappy",    name: "SWAPPY",    iconIdx: 49, type: "WATER",  hp: 24, atk: 9,  desc: "Trades places with itself. You're not sure which is which." },
];

// Starter creature given to player at game start
const STARTER_ID = "sparko";

// Player's lead creature (first in their team). They start with Sparko.
// Wild creatures are randomly drawn from CREATURES (excluding starter usually).

window.CREATURES = CREATURES;
window.STARTER_ID = STARTER_ID;
window.creatureById = (id) => CREATURES.find(c => c.id === id);
})();
