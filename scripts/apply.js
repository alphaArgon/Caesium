/*
 *  scripts/apply.js
 *  Caesium
 *
 *  Created by alpha on 2026/4/28.
 *  Copyright © 2026 alphaArgon.
 */

import { resolve as resolvePath } from "path";
import { readFileSync, writeFileSync } from "fs";
import Plist, { makeCompactArray } from "./plist.js";
import rules from "./rules.js";


let inPath = resolvePath(process.argv[2]);
let outPath = resolvePath(process.argv[3]);
let tSubkern = process.argv[4] === "-t";


let font = Plist.parse(readFileSync(inPath, "utf8"));


let glyphWidth = 0;
let shiftLevel = 0;
let byCategory = {
    n: new Set(),
    w: new Set(),
    s: new Set(),
};


let glyphMap = Object.create(null);
for (let glyph of font.glyphs) {
    let glyphName = glyph.glyphname;
    glyphMap[glyphName] = glyph;

    if (/^[A-Za-z]$/.test(glyphName) || /^[A-Za-z]\.ss\d/.test(glyphName) && !glyphName.includes(".prop")) {
        byCategory.n.add(glyphName);
        glyphWidth = glyph.layers[0].width;

    } else if (glyphName.endsWith(".prop.wp2")) {
        byCategory.w.add(glyphName.slice(0, -9));
        shiftLevel = (glyph.layers[0].width - glyphWidth) / 2;

    } else if (glyphName.endsWith(".prop.wm2")) {
        byCategory.s.add(glyphName.slice(0, -9));
    }

    for (let layer of glyph.layers) {
        formCubicLayer(layer);
    }
}


for (let w of byCategory.w) {
    byCategory.n.delete(w);
}

for (let s of byCategory.s) {
    byCategory.n.delete(s);
}

if (tSubkern) {
    let low = /^[acefgijmnopqrsuvwxyz]/;

    byCategory.T = new Set(["T"]);

    byCategory.n_low = new Set();
    for (let n of byCategory.n) {
        if (low.test(n)) {
            byCategory.n_low.add(n);
        }
    }

    byCategory.w_low = new Set();
    for (let n of byCategory.w) {
        if (low.test(n)) {
            byCategory.w_low.add(n);
        }
    }
}


let classDefs = "";
let lookupDefs = "lookup _ {sub .notdef by .notdef;};\n";
let lookupNames = new Set();

let lookupSubmono1 = "lookup submono1 {";
let submonoSubs = [];

for (let rule of rules) {
    let tIndices = [];
    if (tSubkern) {
        for (let i = 0; i < rule.length - 1; ++i) {
            if (rule[i].value < 0 && rule[i + 1].value >= 0) {
                tIndices.push(i);
            }
        }
        if (rule[rule.length - 1].value < 0) {
            tIndices.push(rule.length - 1);
        }
    }

    for (let tComb of eachCombination(tIndices)) {
        let ts = new Set(tComb);

        let sub = "\n    sub";
    
        for (let [i, {value, shift}] of rule.entries()) {
            sub += " ";
            let lookupName;
            let suffix = (
                shift < 0 ? `sl${-shift}` :
                shift > 0 ? `sr${shift}` :
                "sn0"
            );

            if (ts.has(i)) {
                if (shift === 0) {
                    sub += `@T' lookup _`;
                } else {
                    lookupNames.add(lookupName = `n.${suffix}`);
                    sub += `@T' lookup ${lookupName}`;
                }
                continue;
            }

            let _low = ts.has(i - 1) ? "_low" : "";

            switch (value) {
            case -2:
                lookupNames.add(lookupName = `s2.${suffix}`);
                sub += `@s' lookup ${lookupName}`;
                break;
            case -1:
                lookupNames.add(lookupName = `s1.${suffix}`);
                sub += `@s' lookup ${lookupName}`;
                break;
            case 1:
                lookupNames.add(lookupName = `w1.${suffix}`);
                sub += `@w${_low}' lookup ${lookupName}`;
                break;
            case 2:
                lookupNames.add(lookupName = `w2.${suffix}`);
                sub += `@w${_low}' lookup ${lookupName}`;
                break;
            default:
                if (shift === 0) {
                    sub += `@n${_low}' lookup _`;
                } else {
                    lookupNames.add(lookupName = `n.${suffix}`);
                    sub += `@n${_low}' lookup ${lookupName}`;
                }
                break;
            }
        }

        let n = rule.length;

        if (ts.has(rule.length - 1)) {
            sub += ` @n_low`;
            n += 1;
        }
    
        sub += ";"

        submonoSubs.push([sub, n]);
    }
}

if (globalThis.WeakRef === undefined) {
    throw "Array sorting might be unstable";
}

submonoSubs.sort((a, b) => b[1] - a[1]);
lookupSubmono1 += submonoSubs.map(x => x[0]).join("");
lookupSubmono1 += "\n} submono1;";


for (let category of Object.keys(byCategory)) {
    let glyphNames = [...byCategory[category]].sort();
    byCategory[category] = glyphNames;
    classDefs += `@${category} = [${glyphNames.join(" ")}];\n`;
}


for (let lookupName of [...lookupNames].sort()) {
    lookupDefs += `lookup ${lookupName} {sub @${lookupName[0]} by @${lookupName};};\n`;

    let [prefix, suffix] = lookupName.split("."); 
    if (suffix === undefined) {continue;}

    let category = prefix[0];
    let glyphNames = byCategory[category];
    classDefs += `@${lookupName} = [`;

    for (let [i, glyphName] of glyphNames.entries()) {
        let baseName;
        let mappedName;

        switch (prefix) {
        case "s1":
            baseName = glyphName + ".prop.wm1";
            mappedName = glyphName + ".wm1." + suffix;
            break;
        case "s2":
            baseName = glyphName + ".prop.wm2";
            mappedName = glyphName + ".wm2." + suffix;
            break;
        case "n":
            baseName = glyphName;
            mappedName = glyphName + "." + suffix;
            break;
        case "w1":
            baseName = glyphName + ".prop.wp1";
            mappedName = glyphName + ".wp1." + suffix;
            break;
        case "w2":
            baseName = glyphName + ".prop.wp2";
            mappedName = glyphName + ".wp2." + suffix;
            break;
        }

        if (i !== 0) {
            classDefs += " ";
        }
        classDefs += mappedName;

        let shift = (suffix[2] * shiftLevel) * (suffix[1] === "r" ? 1 : -1);
        let newGlyph = {
            glyphname: mappedName,
            layers: glyphMap[baseName].layers.map(layer => ({
                layerId: layer.layerId,
                shapes: [{
                    alignment: -1,
                    pos: makeCompactArray(shift, 0),
                    ref: baseName,
                }],
                width: glyphWidth,
            }))
        };

        font.glyphs.push(newGlyph);
    }

    classDefs += "];\n";
}


let lookupSubmono2 = `
lookup w2.w1.sr1 {sub @w2.sn0 by @w1.sr1;};
lookup s2.s1.sl1 {sub @s2.sn0 by @s1.sl1;};
lookup w2.sl2.w1 {sub @w2.sl2 by @w1.sl2;};
lookup s2.sr2.s1 {sub @s2.sr2 by @s1.sr2;};

lookup submono2 {
    sub @s' lookup s1.sn0 @n' lookup n.sl1 @n' lookup n.sl1 @s2.sn0' lookup s2.s1.sl1;
    sub @s' lookup s1.sn0 @n' lookup n.sl1 @s2.sn0' lookup s2.s1.sl1;
    sub @s' lookup s1.sn0 @s2.sn0' lookup s2.s1.sl1;
    sub @w' lookup w1.sn0 @n' lookup n.sr1 @n' lookup n.sr1 @w2.sn0' lookup w2.w1.sr1;
    sub @w' lookup w1.sn0 @n' lookup n.sr1 @w2.sn0' lookup w2.w1.sr1;
    sub @w' lookup w1.sn0 @w2.sn0' lookup w2.w1.sr1;
    sub @s2.sr2' lookup s2.sr2.s1 @n' lookup n.sr1 @n' lookup n.sr1 @s' lookup s1.sr1;
    sub @s2.sr2' lookup s2.sr2.s1 @n' lookup n.sr1 @s' lookup s1.sr1;
    sub @s2.sr2' lookup s2.sr2.s1 @s' lookup s1.sr1;
    sub @w2.sl2' lookup w2.sl2.w1 @n' lookup n.sl1 @n' lookup n.sl1 @w' lookup w1.sl1;
    sub @w2.sl2' lookup w2.sl2.w1 @n' lookup n.sl1 @w' lookup w1.sl1;
    sub @w2.sl2' lookup w2.sl2.w1 @w' lookup w1.sl1;
} submono2;
`;


for (let prefix of font.featurePrefixes) {
    if (prefix.name === "submono") {
        prefix.code = `${classDefs}\n${lookupDefs}\n${lookupSubmono1}\n${lookupSubmono2}`;
    }
}

writeFileSync(outPath, Plist.stringify(font), "utf8");


function *eachCombination(elements) {
    if (elements.length === 0) {
        return yield [];
    }

    for (let comb of eachCombination(elements.slice(0, -1))) {
        yield [...comb, elements.at(-1)];
        yield comb;
    }
}


function threeDigitCoord(coord) {
    return Math.round(coord * 1000) / 1000;
}

function formCubicLayer(layer) {
    let shapes = layer.shapes;
    if (shapes === undefined) {return;}

    for (let shape of shapes) {
        let nodes = shape.nodes;
        if (nodes === undefined || nodes.length < 3) {continue;}

        let newNodes = null;
        for (let i = 0; i < nodes.length; ++i) {
            let node = nodes[i];

            if (node[2] === "o") {
                let nextIndex = i === nodes.length - 1 ? 0 : i + 1;
                let next = nodes[nextIndex];
                if (next[2][0] === "q") {
                    if (newNodes === null) {
                        newNodes = nodes.slice(0, i);
                    }

                    let prev = nodes[i === 0 ? nodes.length - 1 : i - 1];

                    let cx1 = threeDigitCoord(node[0] + (prev[0] - node[0]) / 3);
                    let cy1 = threeDigitCoord(node[1] + (prev[1] - node[1]) / 3);
                    let cx2 = threeDigitCoord(node[0] + (next[0] - node[0]) / 3);
                    let cy2 = threeDigitCoord(node[1] + (next[1] - node[1]) / 3);

                    newNodes.push(makeCompactArray(cx1, cy1, "o"));
                    newNodes.push(makeCompactArray(cx2, cy2, "o"));

                    let tag = "c" + next[2].substring(1);
                    next = makeCompactArray(next[0], next[1], tag);

                    if (nextIndex === 0) {
                        newNodes[0] = next;
                    } else {
                        newNodes.push(next);
                        i += 1;
                    }

                    continue;
                }
            }

            if (newNodes !== null) {
                newNodes.push(node);
            }
        }

        if (newNodes !== null) {
            shape.nodes = newNodes;
        }
    }
}
