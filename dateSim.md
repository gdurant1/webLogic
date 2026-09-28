# Game Design Prompt: "Connections" — A Logic-Based Alien Dating Simulator

**Instructions to the AI/Developer Reading This Prompt**
You are being asked to design and build a web-based game (HTML/JS) from this specification. Before writing any code or content:
* Do not assume anything not explicitly stated below. If a detail is missing, ambiguous, or you must make a judgment call to proceed, stop and ask the user a direct question rather than guessing.
* If any two parts of this spec seem to conflict, do not silently pick one — flag the conflict and ask which should take precedence.
* Treat this document as living. Every time the user answers a question or requests a change, update this same document so it stays the single source of truth. Keep a running "Open Questions" section at the bottom and maintain it as you go.
* Confirm your understanding of scope before producing a full build — a short implementation plan or outline first is preferable to guessing at a large deliverable.

---

## 1. Premise & Tone
* **Protagonist:** The player character is an alien / extra-dimensional being with many tentacles, visiting Earth.
* **Tone:** Comedic, lighthearted sci-fi. The humor should come from the culture-clash of a logical, alien mind trying to navigate human social rituals — think fish-out-of-water comedy, not raunchy or dark humor. The game should actively feature **4th Wall Breaks**.
* **Framing of "connections":** Connections should be framed as social/platonic-or-romantic bonds appropriate for a broad, all-ages-friendly audience (think "making a friend/date" in the lighthearted sense of a Saturday-morning-cartoon romance, not explicit or mature content). No sexual content.
* **Goal:** The player's objective is to reach a 100% connection rate with the world's population by making connections with various targets (NPCs) and building logic circuits.

---

## 2. Platform, Visual Style & Audio
* **Platform:** Web page using HTML, CSS, and JavaScript.
* **Asset Requirements:**
    * **Art:** All game art must be original. AI-generated art is strictly not allowed.
    * **Voice Acting:** The game must feature full voice acting, with each NPC having their own unique voice recording.
* **Overworld UI:** The game begins on an HTML5 `<canvas>` with the player character situated in the center. The logic gates (representing the targets) are randomly placed around the player on this canvas. A **% display** must be visible on the screen, showing how much of the world's population the player has connected with.
* **Visual Direction (Encounter Screen):** Once a connection is made on the canvas, a new screen loads emulating classic Japanese dating simulation / visual novel games.
* **UI Elements (Encounter Screen):**
    * A dedicated character name box.
    * A sleek dialogue text window at the bottom of the screen.
    * An affection/health indicator using a heart meter at the top-left of the screen.
    * A multi-choice interactive grid (e.g., a 2x2 layout) for player responses.
    * Character sprites layered over background scenes.

---

## 3. Targets (NPCs) & Dialogue Tree
* **Cast Size:** 8 distinct targets.
* **Thematic Design:** Each NPC maps directly to one of the core logic gates (AND, OR, NOT, XOR, NAND, NOR, XNOR, IMPLIES). Their personalities, conversational styles, and visual themes should reflect the specific logic gate they represent.
* **Value:** Each NPC is worth *n* points towards the player's connection percentage.
* **Dialogue Structure:** Conversations must be built using a **fully modular dialogue tree**, allowing for dynamic branching paths based on player inputs and logic evaluations.

---

## 4. Core Loop & Progression
* **Game Flow:**
    1. **Overworld Phase:** On the starting canvas, the player clicks and drags a tentacle from their central character to one of the randomly placed logic gates. Initially, the player provides *no input signals* to these gates.
    2. **Transition:** A new screen loads, transitioning from the canvas overworld to the visual novel interface, and a conversation begins with that target via the modular dialogue tree.
    3. **Challenge Phase:** The target presents a series of logical challenges (see Section 5).
    4. **Resolution:** The player must answer a required number of challenges correctly to "make a connection" with that target.
* **Success & Circuit Multipliers:**
    * When a player *successfully* completes a date with a logic gate, they gain the *n* points associated with that NPC, increasing their % display.
    * The successfully dated gate is unlocked on the canvas. The player gains the option to change/toggle input signals to that gate and connect more tentacles to it.
    * Unlocked gates can be manually moved and connected to other unlocked gates via their *out/exit* nodes.
    * **Multiplier Effect:** Combining logic gates into functional logic circuits on the canvas creates a multiplier effect, increasing the win meter/percentage significantly faster than individual dates alone. The logic of these circuits evaluates dynamically in real-time.
* **Failure Penalty:**
    * If the player makes too many mistakes, the attempt fails.
    * The logic node for that NPC will **disappear completely** from the canvas.
    * The player's connection % will go down as a penalty.
* **End State & Multiple Endings:**
    * The player wins the game when the % display reaches exactly 100%.
    * The game features **Multiple Endings**. The specific ending achieved depends on how the player reached 100% (and potentially which circuits were built or dialogue paths were taken).

---

## 5. Conversation / Challenge System
Each conversation is a sequence of discrete logic challenges. Every challenge must fall into one of these categories:
* **Syllogism:** The target presents a syllogism. The player selects the logically valid response from a set of options.
* **True/False statement:** The target makes a factual or logical statement; the player answers True or False.
* **Modal logic questions:** Statements involving necessity/possibility ("must," "might," "cannot").
* **Bivalent logic questions:** Classic two-valued (true/false) logic problems, potentially including compound statements (AND/OR/NOT/IF-THEN).
* **Set theory questions:** Questions about membership, subsets, unions, intersections, complements, etc.

**Hard Engine Requirement:** Every single question/challenge, regardless of category above, must be internally representable as a logic gate or combination of logic gates (AND, OR, NOT, XOR, NAND, NOR, XNOR, or an IMPLIES construction built from these).
* Each question should map to a defined truth table.
* The "correct answer" is the output of evaluating that gate/circuit against the given inputs.
* This should hold whether the question is dressed up as a syllogism, a modal logic prompt, or a set theory prompt.

### Question Templates by Category
> **Set Theory**
> Target: "I like hiking, spicy food, and sci-fi movies. What do you like?"
> Player: "I like sci-fi movies, indie music, and hiking."
> Target: "I wonder how many things we have in common. What do you think?"
> *Gate mapping:* membership in each item = a boolean input per item; the intersection is an AND over each pair, then a count/aggregate.
> *Expected response format:* player selects the correct count or resulting set.

> **Boolean Logic**
> Target: "For my ideal Saturday, it's either going to a cafe, or it's not raining outside. What do you think?"
> *Gate mapping:* OR gate with one input being the negation (NOT gate) of "Raining."
> *Expected response format:* given a scenario, player answers True/False as to whether the target's statement holds.

> **Syllogism**
> Target: "Everyone I know who loves sci-fi movies is great at trivia. You love sci-fi movies. Are you great at trivia?"
> *Gate mapping:* Chained IMPLIES/AND structure — (A → B) AND A ⟹ B (modus ponens).
> *Expected response format:* multiple choice ("Yes," "No," "Not necessarily / can't be determined").

> **Modal Logic**
> Target: "It's necessary that you and I make a pair. Do we make a pair, or no?"
> *Gate mapping:* Necessity claims behave like a forced/true input into the circuit (□P). Possibility (◇P) maps to a non-forced, permissive input.

---

## 6. Recommended Codebase Architecture
The codebase is structured into modular JavaScript files to isolate rendering, dialogue logic, audio assets, and real-time circuit evaluation:

| File | Role |
|---|---|
| `datingSimIndex.html` | Page structure: overworld screen + encounter screen |
| `datingSimStyle.css` | Own placeholder palette (does not use the simulator's `style.css`) |
| `datingSimMain.js` | Entry point; imports and starts the four modules below |
| `datingSimRender.js` | Screens, overworld `<canvas>` + DOM gate layer, encounter UI |
| `datingSimDialogue.js` | Modular dialogue tree and challenge flow |
| `datingSimAudio.js` | Per-NPC voice recordings |
| `datingSimCircuit.js` | Gate evaluation, challenge answers, circuit multiplier |

**Current status: skeleton only.** The files above exist with the structure,
placeholder copy, and empty functions marked `TODO`. No game logic, art, NPC
content or audio has been built. Preview the encounter layout with
`datingSimIndex.html?screen=encounter`.

---

## Decisions Log
Answers given by the user so far (each one already reflected in the files):
* **Entry point:** "Lonly? → Yes" in the simulator opens `datingSimIndex.html` in a **new browser tab**; the simulator is left untouched.
* **Overworld rendering — hybrid:** the player and the tentacle are drawn on a real HTML5 `<canvas>` (`#overworld-canvas`), while the targets/gates are DOM elements in `#overworld-gates` layered over it. This matches the wording of Section 2 while keeping the gates easy to hit-test and reuse.
* **File names:** exactly the seven files listed in Section 6.
* **Scope right now:** skeletons only. Every game value (points per NPC, multiplier, penalty, challenge counts, endings, NPC names/personalities) is deferred and will be defined later by the project owner.
* **IMPLIES gate:** not added to the logic simulator at this time (the earlier suggestion was dropped). `datingSimCircuit.js` lists `'implies'` in `GATE_KINDS` as a placeholder only.
* **Page technology:** ES modules, so the page must be served over http (Live Server / Codespaces), not opened from `file://`.

---

## Open Questions
Kept current as questions are answered.
1. **Points per NPC (*n*):** how many points is each of the 8 NPCs worth? Are they all equal?
2. **Challenges per conversation:** how many challenges make a conversation, how many must be answered correctly to connect, and how many mistakes cause a failure?
3. **Failure penalty:** how much does the connection % drop when an attempt fails?
4. **Circuit multiplier:** what formula turns a working circuit into extra percentage ("significantly faster")? Does it depend on gate types, count, or shape?
5. **Reaching "exactly 100%":** what happens if points or multipliers would overshoot 100%? How is the total arranged so exactly 100% is reachable?
6. **Multiple endings:** how many endings are there, and what decides which one plays (circuits built, dialogue paths, order)?
7. **IMPLIES:** one NPC maps to IMPLIES, but the simulator has no IMPLIES gate and none is being added now. When the game needs it, should the game module build it from other gates (e.g. NOT + OR), or should IMPLIES be added to the simulator?
8. **Category naming:** the Section 5 category list says "Bivalent logic questions", but the template heading says "Boolean Logic". Are these the same category, and which name is correct?
9. **Sharing state with the simulator:** the game opens in a new tab. Should it read anything from the simulator (for example the circuit saved in `localStorage`), or is it fully independent?
10. **The 8 NPCs:** names, personalities, conversational styles, visual themes, sprites, backgrounds and voice recordings (all original; no AI art).
11. **Overworld details:** how many gates appear at once, how they are placed (spacing, overlap rules), and what dragging a tentacle looks like.
