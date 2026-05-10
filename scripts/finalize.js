/*
 *  scripts/finalize.js
 *  Caesium
 *
 *  Created by alpha on 2025/10/9.
 *  Copyright © 2025 alphaArgon.
 */

import CP from "child_process";
import FS from "fs";
import Path from "path";

const dirs = [
    Path.resolve(import.meta.dirname, "../exported/static"),
    Path.resolve(import.meta.dirname, "../exported/variable"),
];

for (let dir of dirs) {
    let ttxPath = Path.resolve(dir, "_temp.ttx");

    for (let file of FS.readdirSync(dir)) {
        if (!file.endsWith(".ttf")) {continue;}
        let ttfPath = Path.resolve(dir, file);
        CP.spawnSync("ttx", ["-t", "post", "-t", "OS/2", "-o", ttxPath, ttfPath]);

        let ttx = FS.readFileSync(ttxPath, "utf8");
        ttx = ttx.replace(/<xAvgCharWidth value="\d+"\/>/, `<xAvgCharWidth value="600"/>`);
        ttx = ttx.replace(`<formatType value="2.0"/>`, `<formatType value="3.0"/>`);
        ttx = ttx.replace(`<isFixedPitch value="0"/>`, `<isFixedPitch value="1"/>`);

        FS.writeFileSync(ttxPath, ttx);
        CP.spawnSync("ttx", ["-m", ttfPath, "-o", ttfPath, ttxPath]);
    }

    FS.rmSync(ttxPath);
}
