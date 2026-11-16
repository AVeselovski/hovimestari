# Fineli import fixtures

The three folders here hold rows of release 18 of Fineli, the Finnish food composition database of the Finnish Institute for Health and Welfare (THL). They are used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. Source: [Fineli](https://fineli.fi/). THL does not produce or endorse Hovimestari. The `descript.txt` in each folder is the first twelve lines of THL's own, with its copyright, licence and disclaimer.

Each folder is a small release in the real format: `;` between values, CRLF line ends, decimal commas, and the name files in Windows-1252. Git treats the folders as binary (see `.gitattributes` at the repository root), so no checkout rewrites their bytes. Each holds `food.csv`, `foodname_FI.csv`, `foodname_EN.csv`, `component_value.csv` and `foodaddunit.csv`, filtered to the foods below. `component_value.csv` keeps eight components per food: the four the catalogue reads and four it ignores.

## release-a

18 foods, copied byte for byte: 1, 29, 153, 572, 600, 604, 606, 622, 655, 661, 663, 664, 752, 858, 11049, 11184, 29975 and 31924. Among them:

- 622, the quark: 248,17 kJ, which the import turns into 59.31 kcal.
- 29, a diluted broth with no protein value, and 11184, cinnamon with no values at all. The import leaves both out.
- 572, a margarine whose name starts with `(arc)`. The import retires it.
- 752, a turkey whose medium and large pieces weigh 6000 g and 8000 g, above the 5000 g a portion may weigh.

One row is not THL's: `858;PORTTBL;55,00`, a unit the catalogue does not keep.

## release-b

Release A with these edits, to test a second release:

- 31924 is dropped, and 627 is added (a real release 18 food).
- 11049, the banana, has protein `1,30` instead of `1,20`.
- 153 is renamed from "Kaurahiutale" to "Kaurahiutale, täysjyvä".
- 572 loses `(arc) ` from its Finnish name.
- 622 loses its `TL` measure.

## release-utf8

Release A with `food.csv` and both name files in UTF-8, `foodname_FI.csv` with a byte order mark, and `component_value.csv` with LF line ends. It reads to the same foods as release A.
