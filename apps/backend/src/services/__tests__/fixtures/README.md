# Search ranking sample

`fineli-names-r18.csv` holds 249 real food names from release 18 of Fineli, the Finnish food composition database of the Finnish Institute for Health and Welfare (THL). It is used under the [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) licence. Source: [Fineli](https://fineli.fi/). THL does not produce or endorse Hovimestari.

Each row is a Fineli food id, its food type, its process code, its Finnish name and its English name, separated by `;`. The file holds no nutrient values. The tests give every food the same invented values.

The sample is every food that ranks in the first 40 on the full release for one of the pinned queries ("rahka", "muna", "maito", "kaura", "kana", "jaatelo", "rahka vl", "egg"), plus every "Rahkapiirakka" food, "Munakoiso" and "Porkkana". Foods whose names start with `(arc)` are left out. Because each query's full first 40 is in the sample, a position up to 30 in the sample is the same position on the full release.
