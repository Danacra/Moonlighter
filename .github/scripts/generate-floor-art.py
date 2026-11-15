#!/usr/bin/env python3
"""Generate a coherent original decorative art set for room scenes.
Each wall texture has a fixed one-cell footprint. All assets are CC0-style
original vector drawings built from basic shapes, not copied game graphics.
"""
from pathlib import Path
from random import Random
from xml.etree import ElementTree as ET

OUT=Path("moonlighter-floor-forge/assets")
OUT.mkdir(parents=True,exist_ok=True)
DEFS='''<defs>
<linearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d4c6a3"/><stop offset=".39" stop-color="#97a6a0"/><stop offset="1" stop-color="#435b66"/></linearGradient>
<linearGradient id="wall" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="#7b948e"/><stop offset=".46" stop-color="#445d67"/><stop offset="1" stop-color="#1c303d"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b3"/><stop offset=".4" stop-color="#d2ac66"/><stop offset="1" stop-color="#876940"/></linearGradient>
<linearGradient id="wood" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#bd8e59"/><stop offset=".6" stop-color="#785036"/><stop offset="1" stop-color="#4a342c"/></linearGradient>
<linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e3fff0"/><stop offset=".42" stop-color="#7ce8db"/><stop offset="1" stop-color="#297a9c"/></linearGradient>
<radialGradient id="fire"><stop stop-color="#fff6b0"/><stop offset=".6" stop-color="#ffb65c"/><stop offset="1" stop-color="#b66c4b"/></radialGradient>
</defs>'''
def emit(name,w,h,body):
    val=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{DEFS}{body}</svg>'
    ET.fromstring(val)
    (OUT/name).write_text(val+"\n",encoding="utf-8")

def floor(name,pal,seed):
    base,stone,dark,light,accent=pal
    rng=Random(seed)
    parts=[f'<rect width="400" height="400" fill="{base}"/>']
    for i in range(4):
      for j in range(4):
        x,y=j*100,i*100
        parts += [
          f'<path d="M{x+2} {y+2}H{x+98}V{y+98}H{x+2}Z" fill="{stone}" opacity="{rng.choice([.91,.96,1])}" stroke="{dark}" stroke-width="3"/>',
          f'<path d="M{x+9} {y+10}H{x+88}M{x+9} {y+10}V{y+65}" fill="none" stroke="{light}" stroke-width="2" opacity=".16"/>'
        ]
        if rng.random()<.76:
            xx,yy=x+rng.randint(18,65),y+rng.randint(17,60)
            parts += [f'<path d="M{xx} {yy}l12 -4 8 7 -6 8 9 5" fill="none" stroke="{dark}" stroke-width="2" opacity=".6"/>']
        if rng.random()<.35:
            xx,yy=x+rng.randint(12,80),y+rng.randint(16,75)
            parts += [f'<path d="M{xx} {yy}l7 -5 5 4" fill="none" stroke="{accent}" stroke-width="3" opacity=".32"/>']
        parts += [f'<circle cx="{x+74}" cy="{y+72}" r="1.4" fill="{light}" opacity=".2"/>']
    emit(name,400,400,"".join(parts))
floor("floor-stone.svg",("#264c55","#567f7c","#294e59","#bde0cb","#bdaa77"),41)
floor("floor-boss.svg",("#292943","#50506a","#282943","#b6add0","#bb8ec8"),47)
floor("floor-hazard.svg",("#353946","#6d6d72","#3b3e4b","#d5c3b5","#b87a83"),53)
floor("floor-treasure.svg",("#46424b","#78736f","#45404b","#eed7af","#d7b873"),59)
floor("floor-sanctuary.svg",("#244a58","#579092","#265264","#baf7e9","#8de8e8"),61)

emit("wall-horizontal.svg",100,55,
'<rect x="0" y="3" width="100" height="50" fill="#152432"/><path d="M0 4H100V23H0Z" fill="url(#stone)" stroke="#354957" stroke-width="3"/>'
'<path d="M0 22H100V52H0Z" fill="url(#wall)" stroke="#172c3a" stroke-width="3"/>'
'<path d="M0 24H100" stroke="#aebfa8" stroke-width="3" opacity=".5"/>'
'<path d="M0 39H100M49 3V22M27 40V52M77 40V52" stroke="#1a3140" stroke-width="4"/>'
'<path d="M3 6H96" stroke="#efe0ba" stroke-width="2" opacity=".32"/>'
'<path d="M0 51H100" stroke="#101c2a" stroke-width="7"/>')
emit("wall-vertical.svg",55,100,
'<rect x="3" y="0" width="50" height="100" fill="#152432"/>'
'<path d="M4 0H23V100H4Z" fill="url(#stone)" stroke="#354957" stroke-width="3"/>'
'<path d="M22 0H52V100H22Z" fill="url(#wall)" stroke="#172c3a" stroke-width="3"/>'
'<path d="M24 0V100" stroke="#aebfa8" stroke-width="3" opacity=".5"/>'
'<path d="M39 0V100M3 49H22M40 27H52M40 77H52" stroke="#1a3140" stroke-width="4"/>'
'<path d="M6 3V97" stroke="#efe0ba" stroke-width="2" opacity=".32"/>'
'<path d="M51 0V100" stroke="#101c2a" stroke-width="7"/>')
emit("corner-stone.svg",100,100,
'<ellipse cx="50" cy="85" rx="41" ry="13" fill="#081a27" opacity=".58"/>'
'<path d="M9 20L47 6 89 22 94 69 72 89 26 89 6 69Z" fill="url(#wall)" stroke="#182c3a" stroke-width="9"/>'
'<path d="M17 28L47 15 79 27 76 62 53 77 23 62Z" fill="url(#stone)" stroke="#708680" stroke-width="4"/>'
'<path d="M33 38l13 8 11 -8M45 63l11 -7" stroke="#425a61" stroke-width="4" fill="none"/>')
emit("brazier.svg",160,160,
'<ellipse cx="80" cy="143" rx="60" ry="11" fill="#0b1625" opacity=".6"/>'
'<path d="M52 127L62 79H98L108 127 95 141H65Z" fill="url(#wall)" stroke="#1b3040" stroke-width="9"/>'
'<path d="M25 71L43 110 80 119 117 110 135 71Z" fill="#3b505a" stroke="url(#gold)" stroke-width="8"/>'
'<path d="M29 69L54 58 106 58 131 69Z" fill="#182937" stroke="#a88b63" stroke-width="6"/>'
'<path d="M80 11C102 31 101 44 89 66 71 58 68 45 80 11Z" fill="url(#fire)" stroke="#ffdd96" stroke-width="4"/>'
'<path d="M54 29C71 44 65 54 66 69 44 54 42 42 54 29ZM106 32C117 47 110 60 104 69 98 53 96 42 106 32Z" fill="#f3aa59"/>')
emit("crystal.svg",160,160,
'<ellipse cx="80" cy="146" rx="53" ry="11" fill="#0b1828" opacity=".55"/>'
'<path d="M31 109L50 130H112L131 109 108 98H52Z" fill="url(#stone)" stroke="#284457" stroke-width="7"/>'
'<path d="M80 9L114 46 107 105 80 133 53 105 46 46Z" fill="url(#gem)" stroke="#1e5168" stroke-width="8"/>'
'<path d="M80 11V131L58 97 47 46Z" fill="#a6fff0" opacity=".36"/>'
'<path d="M81 16L105 46 82 73 55 45Z" fill="#cefff6" opacity=".65"/>')
emit("altar.svg",200,160,
'<ellipse cx="100" cy="143" rx="87" ry="13" fill="#071929" opacity=".55"/>'
'<path d="M28 95H172L158 144H44Z" fill="url(#wall)" stroke="#142d3d" stroke-width="9"/>'
'<path d="M19 80H181L174 106H26Z" fill="url(#stone)" stroke="#3a5663" stroke-width="8"/>'
'<path d="M76 72L100 18 124 72Z" fill="url(#gem)" stroke="#255b71" stroke-width="7"/>'
'<path d="M100 19V70M53 116H147" stroke="#dcf9ea" stroke-opacity=".74" stroke-width="5"/>')
emit("rubble.svg",180,120,
'<ellipse cx="90" cy="105" rx="84" ry="11" fill="#081725" opacity=".55"/>'
'<path d="M11 92L36 47 63 65 74 105H18Z" fill="url(#stone)" stroke="#385463" stroke-width="7"/>'
'<path d="M56 100L76 25 121 29 145 96Z" fill="url(#stone)" stroke="#344d59" stroke-width="8"/>'
'<path d="M117 105L144 60 172 91 162 106Z" fill="#6b8181" stroke="#334b58" stroke-width="7"/>'
'<path d="M82 40L100 50 104 79M33 58L49 77" fill="none" stroke="#d4c4a9" stroke-opacity=".5" stroke-width="4"/>')
emit("crate.svg",160,160,
'<ellipse cx="80" cy="140" rx="64" ry="13" fill="#101a28" opacity=".6"/>'
'<path d="M24 43L77 17 140 44 89 72Z" fill="#bc9161" stroke="#3c3636" stroke-width="8"/>'
'<path d="M24 43L89 72V132L25 103Z" fill="url(#wood)" stroke="#293b45" stroke-width="8"/>'
'<path d="M89 72L140 44V104L89 132Z" fill="#785339" stroke="#293b45" stroke-width="8"/>'
'<path d="M43 59L68 113M66 75L43 102M103 76L131 97M127 74L102 112" stroke="#d5ac76" stroke-width="9"/>')
emit("books.svg",180,140,
'<ellipse cx="92" cy="126" rx="78" ry="10" fill="#081725" opacity=".5"/>'
'<path d="M14 85L131 75L147 105L31 117Z" fill="#815958" stroke="#e1cda6" stroke-width="7"/>'
'<path d="M36 56L156 67L145 94L26 83Z" fill="#3e737d" stroke="#d6b97c" stroke-width="7"/>'
'<path d="M18 34L127 20L141 49L33 64Z" fill="#8a6c59" stroke="#eccb84" stroke-width="7"/>')
emit("moss.svg",160,160,
'<path d="M18 113Q36 75 65 87Q74 39 105 50Q128 55 127 91Q150 102 137 133Q106 144 83 124Q58 149 26 136Z" fill="#345d51" stroke="#203c3f" stroke-width="7"/>'
'<path d="M24 116L50 102 69 129M70 91L84 59 97 97M112 101L132 119" stroke="#84a783" stroke-width="9" fill="none" stroke-linecap="round"/>'
'<circle cx="60" cy="100" r="5" fill="#bfca91"/>')
emit("rune-carpet.svg",220,150,
'<path d="M18 12H202L212 138H8Z" fill="#724451" stroke="url(#gold)" stroke-width="10"/>'
'<path d="M29 26H191L199 124H21Z" stroke="#e4c18d" stroke-width="4" fill="none"/>'
'<path d="M110 33L160 75 110 117 60 75Z" fill="#bc7a61" stroke="#f3d59c" stroke-width="6"/>'
'<path d="M110 49L132 75 110 101 88 75Z" fill="#394e63" stroke="#f7dbaa" stroke-width="4"/>')
emit("banner.svg",160,200,
'<path d="M34 18H126V167L80 188 34 167Z" fill="#714753" stroke="url(#gold)" stroke-width="8"/>'
'<path d="M43 29H117V153L80 174 43 153Z" fill="none" stroke="#f0d29b" stroke-opacity=".5" stroke-width="4"/>'
'<path d="M80 54L108 93 80 132 52 93Z" fill="#a57564" stroke="#e6bd7b" stroke-width="6"/>'
'<path d="M66 93H94M80 78V108" stroke="#f7e3bc" stroke-width="5"/>'
'<path d="M25 17H135" stroke="#263b4b" stroke-width="12" stroke-linecap="round"/>')
emit("fungus.svg",160,160,
'<ellipse cx="82" cy="143" rx="63" ry="12" fill="#0d1b28" opacity=".57"/>'
'<path d="M74 78L70 131Q80 143 91 131L88 78Z" fill="#c0b99e" stroke="#617176" stroke-width="7"/>'
'<path d="M28 83Q37 29 81 27Q125 27 132 82Q83 105 28 83Z" fill="#647f9b" stroke="#293c55" stroke-width="8"/>'
'<path d="M37 75Q80 44 124 75" fill="none" stroke="#95b4cf" stroke-width="8" opacity=".7"/>'
'<circle cx="62" cy="53" r="9" fill="#b5d6d3"/><circle cx="96" cy="58" r="7" fill="#b5d6d3"/>')
for svg in OUT.glob("*.svg"):ET.parse(svg)
print("Remastered room art ready:",len(list(OUT.glob("*.svg"))),"assets")
