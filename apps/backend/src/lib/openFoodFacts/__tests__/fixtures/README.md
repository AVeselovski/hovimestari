# Open Food Facts answers

Each file is one answer of the Open Food Facts product API, recorded once by hand with `curl -A "Hovimestari/0.0.1"` and the same `fields` the client asks for. The repository's formatter has re-indented them. The data comes from [Open Food Facts](https://openfoodfacts.org) under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/), each product under the Database Contents License. Open Food Facts does not produce or endorse Hovimestari.

| File                            | Request                         | Product page                                          |
| ------------------------------- | ------------------------------- | ----------------------------------------------------- |
| `valio-milk-6408430000258.json` | `/api/v2/product/6408430000258` | https://world.openfoodfacts.org/product/6408430000258 |
| `upc-a-0012000161155.json`      | `/api/v2/product/0012000161155` | https://world.openfoodfacts.org/product/0012000161155 |
| `not-found-6400000000017.json`  | `/api/v2/product/6400000000017` | None. The answer was HTTP 404                         |

The milk is a drink whose figures are given per 100 ml. The UPC-A is answered under its 13-digit form.

The tests derive the other cases from the milk's answer in code, one field changed at a time: kilojoules only, a missing fat, numeric strings, an array where a number belongs, figures that cannot all be right, no name, long names and `no_nutrition_data`. Each derived case is written next to its test, so the fixture files stay as recorded.
