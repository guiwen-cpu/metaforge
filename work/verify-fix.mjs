import fs from "node:fs";
const u = JSON.parse(fs.readFileSync("outputs/schema-protocol-v0.1/schema/ui.schema.json", "utf8"));
const l = JSON.parse(fs.readFileSync("outputs/schema-protocol-v0.1/schema/logic.schema.json", "utf8"));
console.log("ui OK. EntityDataSource.dependsOn:", !!u.$defs.EntityDataSource.properties.dependsOn,
            "| pkParam oneOf:", !!u.$defs.EntityDataSource.properties.pkParam.oneOf,
            "| DataSourceParam.source:", !!u.$defs.DataSourceParam.properties.source);
console.log("logic OK. Step variants:", l.$defs.Step.oneOf.length, "| FailStep:", !!l.$defs.FailStep);
