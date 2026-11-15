#!/usr/bin/env python3
"""Build Bestiary 0.2.0 reproducibly from the checked-in original 0.1.0 ZIP."""
import json
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
manifest=json.loads(Path("bestiary-module.json").read_text(encoding="utf-8"))
assert manifest["version"]=="0.2.0"
data=[
 dict(id="vault-sentinel",name="Vault Sentinel",biome="Golem",role="elite",archetype="golem",cr=5,damage="bludgeoning",atlasIndex=None,special=dict(name="Печать прохода",save="str",damage="thunder",condition="prone",text="Страж ударяет по полу, создавая руну-печать. Существа в 10 футах должны устоять на ногах, иначе их отбрасывает и сбивает.")),
 dict(id="thorn-idol",name="Thorn Idol",biome="Forest",role="elite",archetype="plant",cr=5,damage="piercing",atlasIndex=None,special=dict(name="Корневая клетка",save="str",damage="poison",condition="restrained",text="Идол выпускает цепкие корни, которые стягивают жертву и оплетают её шипами.")),
 dict(id="dune-warden",name="Dune Warden",biome="Desert",role="elite",archetype="serpent",cr=6,damage="slashing",atlasIndex=None,special=dict(name="Погребальный шквал",save="dex",damage="fire",condition="prone",text="Хранитель поднимает горячий песчаный шквал. Цели сбиваются и теряют устойчивость под напором раскалённого песка.")),
 dict(id="phase-conductor",name="Phase Conductor",biome="Tech",role="elite",archetype="machine",cr=6,damage="lightning",atlasIndex=None,special=dict(name="Фазовый скачок",save="dex",damage="force",condition="frightened",text="Проводник преломляет пространство и выбрасывает противника вспышкой фазовой энергии."))
]
aliases={"vault-sentinel":"stone-soldier","thorn-idol":"blade-tree","dune-warden":"naja","phase-conductor":"corrupted-oscillator"}
with ZipFile("moonlighter-bestiary-v0.1.0.zip") as source,ZipFile("moonlighter-bestiary.zip","w",compression=ZIP_DEFLATED,compresslevel=7) as result:
    paths=set(source.namelist())
    for info in source.infolist():
        path=info.filename
        raw=source.read(path)
        if path=="moonlighter-bestiary/module.json":
            raw=(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n").encode()
        elif path=="moonlighter-bestiary/data/monsters.json":
            records=json.loads(raw)
            assert len(records)==94
            records.extend(data)
            raw=(json.dumps(records,ensure_ascii=False,indent=2)+"\n").encode()
        elif path=="moonlighter-bestiary/scripts/core.mjs":
            code=raw.decode()
            assert "records.length!==94" in code
            raw=code.replace("records.length!==94","records.length!==98").encode()
        elif path=="moonlighter-bestiary/scripts/main.js":
            code=raw.decode().replace("94 существа Moonlighter","98 существ Moonlighter").replace("Импортировать все 94","Импортировать все 98")
            raw=code.encode()
        result.writestr(info,raw)
    for id,src in aliases.items():
        for kind in ("portraits","tokens"):
            path="moonlighter-bestiary/art/"+kind+"/"+src+".webp"
            assert path in paths
            result.writestr("moonlighter-bestiary/art/"+kind+"/"+id+".webp",source.read(path))
with ZipFile("moonlighter-bestiary.zip") as z:
    assert z.testzip() is None
    obj=json.loads(z.read("moonlighter-bestiary/module.json"))
    records=json.loads(z.read("moonlighter-bestiary/data/monsters.json"))
    assert obj["version"]=="0.2.0" and obj["download"].endswith("/bestiary-v0.2.0/moonlighter-bestiary.zip")
    assert len(records)==98 and len({r["id"] for r in records})==98
    for kind in ("tokens","portraits"):
        assert len([x for x in z.namelist() if x.startswith("moonlighter-bestiary/art/"+kind+"/") and x.endswith(".webp")])==98
print("Bestiary 0.2.0 checked: 98 records and 98 pairs of art assets")
