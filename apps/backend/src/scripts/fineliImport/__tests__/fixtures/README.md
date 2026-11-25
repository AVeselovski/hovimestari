# Fineli import fixtures

The three folders here hold rows of release 18 of Fineli, the Finnish food composition database of the Finnish Institute for Health and Welfare (THL). They are used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. Source: [Fineli](https://fineli.fi/). THL does not produce or endorse Hovimestari. The `descript.txt` in each folder is the first twelve lines of THL's own, with its copyright, licence and disclaimer.

Each folder is a small release in the real format: `;` between values, CRLF line ends, decimal commas, and the name files in Windows-1252. Git treats the folders as binary (see `.gitattributes` at the repository root), so no checkout rewrites their bytes. Each holds `food.csv`, `foodname_FI.csv`, `foodname_EN.csv`, `component_value.csv` and `foodaddunit.csv`, filtered to the foods below. Release A and release B also hold `contribfood.csv`, the release's recipe file, filtered to twelve recipes. `component_value.csv` keeps eight components per food: the four the catalogue reads and four it ignores.

## release-a

18 foods, copied byte for byte: 1, 29, 153, 572, 600, 604, 606, 622, 655, 661, 663, 664, 752, 858, 11049, 11184, 29975 and 31924. Among them:

- 622, the quark: 248,17 kJ, which the import turns into 59.31 kcal.
- 29, a diluted broth with no protein value, and 11184, cinnamon with no values at all. The import leaves both out.
- 572, a margarine whose name starts with `(arc)`. The import retires it.
- 752, a turkey whose medium and large pieces weigh 6000 g and 8000 g, above the 5000 g a portion may weigh.

One row is not THL's: `858;PORTTBL;55,00`, a unit the catalogue does not keep.

`contribfood.csv` holds every row of twelve recipes, copied byte for byte: 29, 953, 6011, 7513, 29306, 30161, 31749, 32823, 34491, 34684, 34886 and 34995. Only 29 is a food of this release, and the import leaves it out. The other eleven count as recipes that use the foods here: skimmed milk (606) in five, sugar (1), the egg (858) and the banana (11049) in four each, oats (153) in three, the quark (622) in two, and ice cream (663) and the turkey (752) in one each. Most of their other ingredients, water (922) and salt (30) among them, are foods this release does not list. So no row here is left out of a recipe's foods as water or salt.

The recipe rows come from `contribfood.csv` of Basic package 2, release 18, as mirrored at `raw.githubusercontent.com/theel0ja/fineli-data/master/basic-package-2/`. The committed counts in `recipeCountsR18.ts`, two folders up, were built from that file and the same package's `food.csv`. Neither input file is in the repository.

## release-b

Release A with these edits, to test a second release:

- 31924 is dropped, and 627 is added (a real release 18 food).
- 11049, the banana, has protein `1,30` instead of `1,20`.
- 153 is renamed from "Kaurahiutale" to "Kaurahiutale, täysjyvä".
- 572 loses `(arc) ` from its Finnish name.
- 622 loses its `TL` measure.
- `contribfood.csv` loses recipe 7513, the only one that uses the turkey, 752.

## release-utf8

Release A with `food.csv` and both name files in UTF-8, `foodname_FI.csv` with a byte order mark, and `component_value.csv` with LF line ends. It has no `contribfood.csv`. It reads to the same foods as release A, without recipe counts.
