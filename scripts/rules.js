/*
 *  scripts/rules.js
 *  Caesium
 *
 *  Created by alpha on 2025/10/9.
 *  Copyright © 2025 alphaArgon.
 */


const RULES_TEMPLATE = `
    -2 0{,3} +2
    -1 0{4} +1

    -1 0{,4} -1 0{,3} +2
    -1 0{,3} +2 0{,3} -1

    -2 0{,3} -2 0{,3} +2 0{,3} +2
    -1 0{4} -1 0{4} +1 0{4} +1

    -2 0{,3} +2 0{,3} -2 0{,3} +2
    -2 0{,3} +2 0{,3} +2 0{,3} -2
    -1 0{4} +1 0{4} -1 0{4} +1
`;

let rules = RULES_TEMPLATE.split("\n").flatMap(expandRule);
rules = [...new Set(rules)]
    .map(r => [r.split(" "), r])
    .sort((a, b) => b[0].length - a[0].length || a[1].localeCompare(b[1]))
    .map(([r]) => withShiftAnnotated(r.map(Number)))
    .filter(r => {
        for (let {value, shift} of r) {
            if (value === 0 && shift === 0) {return false;}
        }
        return true;
    });


export default rules;


function expandRule(line) {
    let match = line.match(/(.)\{(.+?)\}/);

    if (match === null) {
        let trimmed = line.trim().replace(/\s+/g, " ");
        if (trimmed.length === 0) {return [];}

        let reversed = trimmed.split(" ").reverse().join(" ");
        let signSwapped = trimmed.replace(/[-+]/g, c => c === "-" ? "+" : "-");
        let reversedSignSwapped = reversed.replace(/[-+]/g, c => c === "-" ? "+" : "-");

        return [trimmed, reversed, signSwapped, reversedSignSwapped];
    }

    let [occurrence, value, range] = match;
    let min, max;

    if (range.includes(',')) {
        [min, max] = ("0" + range).split(',').map(Number);
    } else {
        min = max = Number(range);
    }

    let rules = [];

    for (let i = min; i <= max; ++i) {
        let replacement = Array(i).fill(value).join(' ');
        let replaced = line.replace(occurrence, replacement);  //  Not replaceAll
        rules.push(...expandRule(replaced));
    }

    return rules;
}


function withShiftAnnotated(rule) {
    let shift = 0;
    let annotated = [];

    for (let value of rule) {
        annotated.push({value, shift});
        shift += value;
    }

    return annotated;
}
