# Evidence: food search before and after, on Fineli release 18

The tables behind [food-search-ranking.md](food-search-ranking.md), as revised after the design review. Each of 83 searches was run on the full release 18 catalogue (4,023 live foods) in a scratch Postgres, under the rule as built at master 4b48c6f ("Before") and under the proposed rule ("After"), once with the food-name language set to Finnish and once to English. Each cell is the name shown at that rank. `[D]` marks a food Fineli types as a dish. A search with fewer than eight matches has fewer rows.

Release 18 is the release the tests use. The owner's local catalogue is release 20, which holds more foods, so a rank can differ there.

The proposed rule here is the revised one: recipe uses order basic foods only, and the "härän" pair is gone. No user is signed in, so no food is a favourite, an own food or a scanned product, and the "yours" step decides nothing.

The "After" columns are the `foods` list only. For "jauheliha 10 nauta" the proposed rule also answers a `near` list: "Jauheliha, sika-nauta", "Jauheliha, naudanpaisti, rasvaa 9 %", "Jauheliha, naudan, rasvaa 17 %", "Jauheliha, naudan, vähärasvainen, rasvaa 7 %", "Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 7 %", then three fried forms.

A first screen does not show a dish that leaves the 30 rows. Those are listed with their ranks in the design, under "The log sheet's everyday searches".

## The owner's two searches

### `spagetti`

| #   | Before, Finnish names                                      | After, Finnish names                                                          | Before, English names                                           | After, English names                                                           |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Bolognan spagetti, hk, valmisateria [D]                    | Pasta, spagetti, makaroni                                                     | Spagetti bolognese, hk, ready meal [D]                          | Pasta, spaghetti, macaroni                                                     |
| 2   | Spagetti ja jauhelihakastike, saarioinen, valmisateria [D] | Pasta, spagetti, makaroni, luontaisesti gluteeniton                           | Spaghetti bolognese, saarioinen, ready meal [D]                 | Pasta, spaghetti, macaroni, naturally gluten-free                              |
| 3   | Spagettikastikejauhe, kastikeainekset, knorr               | Pasta, spagetti, luontaisesti gluteeniton, kananmunaa                         | Bolognese gravy mix, knorr                                      | Pasta, spaghetti, naturally gluten-free, contains egg                          |
| 4   | Spagettilihavuoka [D]                                      | Pasta, spagetti, keitetty, suolaa [D]                                         | Spaghetti and minced meat casserole [D]                         | Pasta, spaghetti, boiled, salt [D]                                             |
| 5   | Spagettilihavuoka, saarioinen, valmisateria [D]            | Pasta, spagetti, keitetty, suolaton [D]                                       | Spaghetti and minced meat casserole, saarioinen, ready meal [D] | Pasta, spaghetti, boiled without salt [D]                                      |
| 6   | Pasta, spagetti, makaroni                                  | Pasta, spagetti, pinaattispagetti, keitetty, suolaton [D]                     | Spaghetti spinach, contains egg                                 | Pasta, spaghetti, spinach, boiled without salt [D]                             |
| 7   | Pasta, pinaattispagetti, sisältää kananmunaa               | Pasta, spagetti, luontaisesti gluteeniton, kananmunaa, keitetty, suolaton [D] | Pasta, spaghetti, macaroni                                      | Pasta, spaghetti, naturally gluten-free, contains egg, boiled without salt [D] |
| 8   | Pasta, spagetti, makaroni, luontaisesti gluteeniton        | Pasta, pinaattispagetti, sisältää kananmunaa                                  | Pasta, spaghetti, macaroni, naturally gluten-free               | Spaghetti spinach, contains egg                                                |

### `jauheliha 10 nauta`

| #   | Before, Finnish names                                    | After, Finnish names                                     | Before, English names               | After, English names                |
| --- | -------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| 1   | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 % | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 % | Pork and beef steak mince, 10% fat  | Pork and beef steak mince, 10% fat  |
| 2   | Jauheliha, kevyt, sika-nauta, paistettu [D]              | Jauheliha, kevyt, sika-nauta, paistettu [D]              | Pork beef mince, 10% fat, fried [D] | Pork beef mince, 10% fat, fried [D] |

## The searches of the TODO.md item

### `rahka`

| #   | Before, Finnish names                         | After, Finnish names                              | Before, English names         | After, English names          |
| --- | --------------------------------------------- | ------------------------------------------------- | ----------------------------- | ----------------------------- |
| 1   | Rahka, maustettu, rasvaa 4 %                  | Rahka, maitorahka, maustamaton, rasvaa <0,5 %     | Quark, <0.5% fat              | Quark, <0.5% fat              |
| 2   | Rahka, maustettu, rasvaa 2,9 %                | Rahka, maitorahka, maustamaton, rasvaa <0,5 %, vl | Cream quark, 10% fat          | Quark, <0.5% fat, low-lactose |
| 3   | Rahka, maustettu, rasvaa 3,5 %                | Rahka, maustettu, rasvaa 4 %                      | Quark, flavoured, 4% fat      | Cream quark, 10% fat          |
| 4   | Rahka, maustettu, rasvaa 4,5 %                | Rahka, maustettu, rasvaa 2,9 %                    | Quark, flavoured, 2.9% fat    | Quark, flavoured, 4% fat      |
| 5   | Rahka, maustettu, rasvaa 7 %, vl              | Rahka, maustettu, rasvaa 3,5 %                    | Quark, flavoured, 3.5% fat    | Quark, flavoured, 2.9% fat    |
| 6   | Rahka, maustettu, danio, rasvaa 3 %           | Rahka, maustettu, rasvaa 4,5 %                    | Quark, flavoured, 4.5% fat    | Quark, flavoured, 3.5% fat    |
| 7   | Rahka, maustamaton, kermarahka, rasvaa 10 %   | Rahka, maustettu, rasvaa 7 %, vl                  | Quark, 2,3% fat, low-lactose  | Quark, flavoured, 4.5% fat    |
| 8   | Rahka, maitorahka, maustamaton, rasvaa <0,5 % | Rahka, maustettu, danio, rasvaa 3 %               | Quark, <0.5% fat, low-lactose | Quark, 2,3% fat, low-lactose  |

### `maito`

| #   | Before, Finnish names                   | After, Finnish names                                                | Before, English names                                 | After, English names                               |
| --- | --------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| 1   | Maito, kutunmaito, vuohenmaito          | Maito, kevytmaito, d-vitamiinia 1 ug                                | Milk, goat milk                                       | Milk, 1.5% fat, 1 ug added vitamin d               |
| 2   | Maito, rasvaton, d-vitamiinia 1 ug      | Maito, rasvaton, d-vitamiinia 1 ug                                  | Milk, 0% fat, i ug added vitamin d                    | Milk, 0% fat, i ug added vitamin d                 |
| 3   | Maito, keskiarvo, d-vitamiinia 1 ug     | Maito, täysmaito, d-vitamiinia 1 ug                                 | Milk, 1% fat, 1 ug added vitamin d                    | Milk, 3.5% fat, 1 ug added vitamin d               |
| 4   | Maito, täysmaito, d-vitamiinia 1 ug     | Maito, kevytmaito, ei lisätty d-vitamiinia, luomu                   | Milk, average, 1 ug added vitamin d                   | Milk, 1.5% fat, without added vitamin d, organic   |
| 5   | Maito, ykkösmaito, d-vitamiinia 1ug     | Maito, kevytmaito, laktoositon maitojuoma, d-vitamiinia 1 ug        | Milk, 1.5% fat, 1 ug added vitamin d                  | Milk, 1.5% fat, lactose-free, 1 ug added vitamin d |
| 6   | Maito, kevytmaito, d-vitamiinia 1 ug    | Maito, rasvaton, ei lisätty d-vitamiinia, luomu                     | Milk, 3.5% fat, 1 ug added vitamin d                  | Milk, 0% fat, without added vitamin d, organic     |
| 7   | Maito, rasvaton, vl, d-vitamiinia 1 ug  | Maito, kevytmaito, vl, d-vitamiinia 1 ug                            | Milk, 0% fat, with added calcium and 0.5 ug vitamin d | Milk, 1.5% fat, low-lactose, 1 ug added vitamin d  |
| 8   | Maito, täysmaito, vl, d-vitamiinia 1 ug | Maito, tilamaito, raakamaito, rasvaa 4,4 %, ei lisätty d-vitamiinia | Milk, 0% fat, valio plus, 2 ug added vitamin d        | Milk, raw milk, 4.4 % fat, without added vitamin d |

### `kana`

| #   | Before, Finnish names          | After, Finnish names                                          | Before, English names            | After, English names                                                      |
| --- | ------------------------------ | ------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| 1   | Kana                           | Kana                                                          | Chicken                          | Chicken                                                                   |
| 2   | Kana, keitetty, suolaa [D]     | Kana, keitetty, suolaa [D]                                    | Chicken, boiled with salt [D]    | Chicken, boiled with salt [D]                                             |
| 3   | Kana, keitetty, suolaton [D]   | Kana, keitetty, suolaton [D]                                  | Chicken, boiled without salt [D] | Chicken, boiled without salt [D]                                          |
| 4   | Porkkana                       | Porkkana                                                      | Carrot                           | Carrot                                                                    |
| 5   | Porkkana, kuivattu             | Porkkana, kuivattu                                            | Carrot, dried                    | Carrot, dried                                                             |
| 6   | Porkkana, uunissa [D]          | Porkkana, keitetty, suolaton [D]                              | Carrot, baked [D]                | Carrot, boiled without salt [D]                                           |
| 7   | Porkkana, paistettu [D]        | Porkkana, keitetty, suolaa [D]                                | Carrot, fried [D]                | Carrot, boiled, salt [D]                                                  |
| 8   | Porkkana, keitetty, suolaa [D] | Ateriankorvike, keittojauhe, parsa/kala/kana/sieni, easy diet | Carrot, boiled without salt [D]  | Meal replacement, soup powder, asparagus/fish/chicken/mushroom, easy diet |

### `kaura`

| #   | Before, Finnish names                                 | After, Finnish names                                  | Before, English names                                   | After, English names                                    |
| --- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Nyhtökaura                                            | Nyhtökaura                                            | Pulled oats                                             | Pulled oats                                             |
| 2   | Kaurahiutale                                          | Kaurahiutale                                          | Oat drink without milk                                  | Oats, rolled, oat flakes                                |
| 3   | Kaurakuitunen, kaurarouhe                             | Kauramakaroni, sisältää vehnää ja kauraa              | Oat macaroni, contains wheat and oats                   | Oat macaroni, contains wheat and oats                   |
| 4   | Kauramakaroni, sisältää vehnää ja kauraa              | Kaurajuoma, maidoton, oat drink                       | Oat drink without milk, with added calcium              | Oat drink without milk                                  |
| 5   | Kaurajuoma, maidoton, oat drink                       | Kaurakuitunen, kaurarouhe                             | Oat drink without milk, average of industrial products  | Oat drink without milk, with added calcium              |
| 6   | Kaurajuoma, maidoton, lisätty kalsiumia               | Kaurajuoma, maidoton, lisätty kalsiumia               | Oat drink without milk, with added calcium and vitamins | Oat drink without milk, average of industrial products  |
| 7   | Kaurajuoma, maustamaton, tuotekeskiarvo               | Kaurajuoma, maustamaton, tuotekeskiarvo               | Oats, rolled, oat flakes                                | Oat drink without milk, with added calcium and vitamins |
| 8   | Kaurajuoma, rainbow, lisätty kalsiumia ja vitamiineja | Kaurajuoma, rainbow, lisätty kalsiumia ja vitamiineja | Oat, coarse-ground oat, kaurakuitunen                   | Oat, coarse-ground oat, kaurakuitunen                   |

### `egg`

| #   | Before, Finnish names                              | After, Finnish names                              | Before, English names               | After, English names                |
| --- | -------------------------------------------------- | ------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| 1   | Viiriäisen muna                                    | Kananmuna, kuoreton                               | Egg without shell                   | Egg without shell                   |
| 2   | Kananmuna, kuoreton                                | Kananmunan keltuainen, 34 % kananmunan massasta   | Egg yolk, 34% of egg mass           | Egg yolk, 34% of egg mass           |
| 3   | Kananmuna, kuorineen punnittu                      | Kananmunan valkuainen, 66 % kananmunan massasta   | Egg white, 66% of egg mass          | Egg white, 66% of egg mass          |
| 4   | Kananmunan keltuainen, 34 % kananmunan massasta    | Kananmuna, kuoreton, luomu                        | Egg powder, for food industry       | Egg, omega, without shell           |
| 5   | Kananmunan valkuainen, 66 % kananmunan massasta    | Kananmuna, omega, kuoreton                        | Egg yolk powder, for food industry  | Egg, without shell, organic         |
| 6   | Keltuaisjauhe, elintarviketeollisuuden raaka-aine  | Viiriäisen muna                                   | Egg white powder, for food industry | Egg powder, for food industry       |
| 7   | Valkuaisjauhe, elintarviketeollisuuden raaka-aine  | Kananmuna, kuorineen punnittu                     | Egg, quail, raw                     | Egg yolk powder, for food industry  |
| 8   | Kananmunajauhe, elintarviketeollisuuden raaka-aine | Keltuaisjauhe, elintarviketeollisuuden raaka-aine | Egg, whole, with shell              | Egg white powder, for food industry |

### `rice`

| #   | Before, Finnish names | After, Finnish names               | Before, English names | After, English names               |
| --- | --------------------- | ---------------------------------- | --------------------- | ---------------------------------- |
| 1   | Riisi tumma           | Riisi puuroutuva                   | Rice cake             | Rice, white                        |
| 2   | Riisisuklaa           | Riisi pitkäjyväinen, puuroutumaton | Rice drink            | Rice, white, long-grain, parboiled |
| 3   | Täysjyväriisi         | Täysjyväriisi                      | Rice starch           | Rice, wholegrain                   |
| 4   | Riisi-ohraseos        | Riisi tumma                        | Rice chocolate        | Rice and oat mix                   |
| 5   | Riisi-ruisseos        | Riisi-kauraseos                    | Rice ice cream        | Rice and rye mix                   |
| 6   | Riisitärkkelys        | Ruis-riisiseos, riisi ja ruisrouhe | Rice and oat mix      | Rice, brown                        |
| 7   | Riisi-kauraseos       | Riisi-ohraseos                     | Rice and rye mix      | Rice and rye mix                   |
| 8   | Riisi puuroutuva      | Riisi-ruisseos                     | Rice and rye mix      | Rice and barley mix                |

### `omena`

| #   | Before, Finnish names                   | After, Finnish names                    | Before, English names               | After, English names                |
| --- | --------------------------------------- | --------------------------------------- | ----------------------------------- | ----------------------------------- |
| 1   | Omena, kuivattu                         | Omena, keskiarvo, punnittu kuorineen    | Apple, dried                        | Apple, average, with skin           |
| 2   | Omena, kotimainen, kuorittu             | Omena, ulkomainen, kuorittu             | Apple, average, with skin           | Apple, imported, without skin       |
| 3   | Omena, ulkomainen, kuorittu             | Omena, kotimainen, kuorittu             | Apple, domestic, without skin       | Apple, domestic, without skin       |
| 4   | Omena, keskiarvo, punnittu kuorineen    | Omena, kuivattu                         | Apple, imported, without skin       | Apple, dried                        |
| 5   | Omena, kotimainen, keskiarvo, kuorineen | Omena, kotimainen, keskiarvo, kuorineen | Apple, domestic, average, with skin | Apple, domestic, average, with skin |
| 6   | Omena, ulkomainen, keskiarvo, kuorineen | Omena, ulkomainen, keskiarvo, kuorineen | Apple, imported, average, with skin | Apple, imported, average, with skin |
| 7   | Granaattiomena, kuorittu                | Granaattiomena, kuorittu                | Pomegranate, without skin           | Pomegranate, without skin           |
| 8   | Uuniomena [D]                           | Hunaja-omena-viinietikka                | Baked apple [D]                     | Vinegar with honey and apple        |

### `peruna`

| #   | Before, Finnish names                                | After, Finnish names                                 | Before, English names                   | After, English names                    |
| --- | ---------------------------------------------------- | ---------------------------------------------------- | --------------------------------------- | --------------------------------------- |
| 1   | Peruna, uusi                                         | Peruna, vanha, kuorittu                              | Potato, new                             | Potato, peeled                          |
| 2   | Peruna, kuivattu                                     | Peruna, punnittu kuorineen                           | Potato, dried                           | Potato, unpeeled, avarage, raw          |
| 3   | Peruna, punnittu kuorineen                           | Peruna, uusi                                         | Potato, peeled                          | Potato, new                             |
| 4   | Peruna, vanha, kuorittu                              | Peruna, kuivattu                                     | Potato, unpeeled, avarage, raw          | Potato, dried                           |
| 5   | Peruna, kuorittu, suurtaloustuote, suojakaasupakattu | Peruna, kuorittu, suurtaloustuote, suojakaasupakattu | Potato, peeled, vacuum packed, catering | Potato, peeled, vacuum packed, catering |
| 6   | Peruna, paistettu [D]                                | Peruna, kuorittu, keitetty, suolaton [D]             | Potato, fried [D]                       | Potato, peeled, boiled without salt [D] |
| 7   | Peruna, paistettu, voi [D]                           | Peruna, kuorittu, keitetty, suolaa [D]               | Potato, fried in butter [D]             | Potato, peeled, boiled with salt [D]    |
| 8   | Peruna, uusi, keitetty, suolaa [D]                   | Peruna, kuorineen, keitetty, suolaa [D]              | Potato, new, boiled with salt [D]       | Potato, unpeeled, boiled with salt [D]  |

## Everyday ingredients, Finnish

### `kerma`

| #   | Before, Finnish names                                        | After, Finnish names                                         | Before, English names                                    | After, English names                                     |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Kerma, kuohukerma, rasvaa 35 %                               | Kerma, kuohukerma, rasvaa 35 %                               | Whipping cream, 35% fat                                  | Whipping cream, 35% fat                                  |
| 2   | Kerma, kuohukerma, rasvaa 38 %                               | Kerma, vispikerma, rasvaa 38 % ,vl, iskukuumennettu          | Whipping cream, 38% fat                                  | Whipping cream, 38% fat, low-lactose, ultra-heat-treated |
| 3   | Kerma, valio vaahtoutuva mansikka-/suklaakerma, laktoositon  | Kerma, kuohukerma, rasvaa 38 %                               | Cream, low-fat, 25% fat                                  | Whipping cream, 38% fat                                  |
| 4   | Kerma, vispikerma, kevyt, rasvaa 25 %                        | Kerma, kahvikerma, kevyt, rasvaa 10 %, vl                    | Cream, valio strawberry/chocolate, lactose-free          | Cream, low-fat, 1o% fat, low-lactose                     |
| 5   | Kerma, vispikerma, rasvaa 38 % ,vl, iskukuumennettu          | Kerma, valio vaahtoutuva mansikka-/suklaakerma, laktoositon  | Cream, low-fat, 1o% fat, low-lactose                     | Cream, low-fat, 25% fat                                  |
| 6   | Kerma, kahvikerma, kevyt, rasvaa 10 %, vl                    | Kerma, vispikerma, kevyt, rasvaa 25 %                        | Cream, vegetable fat, 26% fat, flora                     | Cream, valio strawberry/chocolate, lactose-free          |
| 7   | Kerma, kuohukerma, kasvirasvakerma, flora kuohu, rasvaa 26 % | Kerma, kuohukerma, kasvirasvakerma, flora kuohu, rasvaa 26 % | Whipping cream, 38% fat, low-lactose, ultra-heat-treated | Cream, vegetable fat, 26% fat, flora                     |
| 8   | Ruoanvalmistuskerma, rasvaa 15 %                             | Ruoanvalmistuskerma, rasvaa 19 %, kahvikerma                 | Cooking cream, 15% fat                                   | Cooking cream, 19% fat                                   |

### `voi`

| #   | Before, Finnish names           | After, Finnish names                               | Before, English names                                         | After, English names                             |
| --- | ------------------------------- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| 1   | Voi                             | Voi                                                | Butter                                                        | Butter                                           |
| 2   | Voi, suolaton                   | Voi, suolaton                                      | Butter lactose-free                                           | Butter, unsalted                                 |
| 3   | Voi, laktoositon                | Voi, laktoositon                                   | Butter, unsalted                                              | Butter lactose-free                              |
| 4   | Voi, vähäsuolainen              | Voi, vähäsuolainen                                 | Butter, low-sodium                                            | Butter, low-sodium                               |
| 5   | Voi, voimakassuolainen          | Voi, voimakassuolainen                             | Butter, high-sodium                                           | Butter, high-sodium                              |
| 6   | Voi, laktoositon, vähäsuolainen | Voi, laktoositon, vähäsuolainen                    | Butter lactose-free, low sodium                               | Butter lactose-free, low sodium                  |
| 7   | Munavoi [D]                     | Rasvaseos 60%, benecol voi & rypsi                 | Hard-boiled egg and cottage cheese mixture [D]                | Blended spread 60%, benecol voi & rypsi          |
| 8   | Raejuusto-munavoi [D]           | Rasvaseoslevite 70%, flora & voi normaalisuolainen | Egg and butter spread, hard-boiled egg and butter mixture [D] | Blended spread 70%, flora & voi, normally salted |

### `juusto`

| #   | Before, Finnish names                     | After, Finnish names                                                     | Before, English names                | After, English names                                    |
| --- | ----------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------- |
| 1   | Juusto, tuotekeskiarvo                    | Juusto, emmentaljuusto, rasvaa 27-30 %, punaleima                        | Cheese, average                      | Cheese, emmental, 27-30% fat, red-label                 |
| 2   | Juusto, cheddar, rasvaa 34 %              | Juusto, tuotekeskiarvo                                                   | Cheese, polar, 20% fat               | Cheese, average                                         |
| 3   | Juusto, polar 5 % rasvaa, valio           | Juusto, emmentaljuusto, rasvaa 27-30 %, suurikoloinen, sinileima/gruyere | Cheese, cheddar type, 34% fat        | Cheese, emmental, 27-30% fat, blue-label                |
| 4   | Juusto, polar 10 % rasvaa, valio          | Juusto, salaattijuusto, rasvaa 18 %, lehmänmaito, suolaliemessä          | Cheese, vegetable fat, 28% fat       | Cheese, feta type salad cheese in brine, 18% fat        |
| 5   | Juusto, polar 15 % rasvaa, valio          | Juusto, sinihomejuusto, rasvaa 27-30 %, aura/danazole, keskiarvo         | Cheese, halloumi cheese, 22% fat     | Cheese, blue cheese, aura/danazole, average, 27-30% fat |
| 6   | Juusto, leipäjuusto, rasvaa 17-23 %       | Juusto, cheddar, rasvaa 34 %                                             | Cheese, mozzarella cheese, 20% fat   | Cheese, cheddar type, 34% fat                           |
| 7   | Juusto, rasvaa 28 %, sisältää kasvirasvaa | Juusto, mozzarella, rasvaa 20 %, tuorejuusto                             | Cheese, polar täyteläinen, 28% fat   | Cheese, mozzarella cheese, 20% fat                      |
| 8   | Juusto, polar, 20 % rasvaa, valio         | Juusto, kova pienikoloinen juusto, rasvaa 24-27 %, edam                  | Cheese, turunmaa/oltermanni, 30% fat | Cheese, hard cheese, edam type, 24-27% fat              |

### `kananmuna`

| #   | Before, Finnish names          | After, Finnish names                          | Before, English names       | After, English names                 |
| --- | ------------------------------ | --------------------------------------------- | --------------------------- | ------------------------------------ |
| 1   | Kananmuna, kuoreton            | Kananmuna, kuoreton                           | Egg without shell           | Egg without shell                    |
| 2   | Kananmuna, kuorineen punnittu  | Kananmuna, kuoreton, luomu                    | Egg, whole, with shell      | Egg, omega, without shell            |
| 3   | Kananmuna, kuoreton, luomu     | Kananmuna, omega, kuoreton                    | Egg, omega, without shell   | Egg, without shell, organic          |
| 4   | Kananmuna, omega, kuoreton     | Kananmuna, kuorineen punnittu                 | Egg, without shell, organic | Egg, whole, with shell               |
| 5   | Kananmuna, keitetty [D]        | Kananmuna, keitetty [D]                       | Egg, fried [D]              | Egg, boiled [D]                      |
| 6   | Kananmuna, paistettu [D]       | Kananmuna, luomu, keitetty [D]                | Egg, boiled [D]             | Egg, omega, boiled [D]               |
| 7   | Kananmuna, luomu, keitetty [D] | Kananmuna, omega, keitetty [D]                | Egg, omega, boiled [D]      | Egg, organic, boiled [D]             |
| 8   | Kananmuna, omega, keitetty [D] | Kananmuna, paistettu, ei rasvaa, suolaton [D] | Egg, organic, fried [D]     | Egg, fried, without fat and salt [D] |

### `muna`

| #   | Before, Finnish names          | After, Finnish names                          | Before, English names       | After, English names                 |
| --- | ------------------------------ | --------------------------------------------- | --------------------------- | ------------------------------------ |
| 1   | Kananmuna, kuoreton            | Kananmuna, kuoreton                           | Egg without shell           | Egg without shell                    |
| 2   | Kananmuna, kuorineen punnittu  | Kananmuna, kuoreton, luomu                    | Egg, whole, with shell      | Egg, omega, without shell            |
| 3   | Kananmuna, kuoreton, luomu     | Kananmuna, omega, kuoreton                    | Egg, omega, without shell   | Egg, without shell, organic          |
| 4   | Kananmuna, omega, kuoreton     | Kananmuna, kuorineen punnittu                 | Egg, without shell, organic | Egg, whole, with shell               |
| 5   | Kananmuna, keitetty [D]        | Kananmuna, keitetty [D]                       | Egg, fried [D]              | Egg, boiled [D]                      |
| 6   | Kananmuna, paistettu [D]       | Kananmuna, luomu, keitetty [D]                | Egg, boiled [D]             | Egg, omega, boiled [D]               |
| 7   | Kananmuna, luomu, keitetty [D] | Kananmuna, omega, keitetty [D]                | Egg, omega, boiled [D]      | Egg, organic, boiled [D]             |
| 8   | Kananmuna, omega, keitetty [D] | Kananmuna, paistettu, ei rasvaa, suolaton [D] | Egg, organic, fried [D]     | Egg, fried, without fat and salt [D] |

### `sipuli`

| #   | Before, Finnish names                                    | After, Finnish names                | Before, English names                            | After, English names           |
| --- | -------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ | ------------------------------ |
| 1   | Sipuli, kuivattu                                         | Sipuli, keltasipuli                 | Onion                                            | Onion                          |
| 2   | Sipuli, punasipuli                                       | Sipuli, punasipuli                  | Onion, dried                                     | Onion, red onion               |
| 3   | Sipuli, keltasipuli                                      | Sipuli, kuivattu                    | Onion, red onion                                 | Onion, dried                   |
| 4   | Sipuli, paistettu [D]                                    | Sipuli, keitetty, suolaton [D]      | Onion stuffed with rice and pork beef mince [D]  | Onion, boiled without salt [D] |
| 5   | Sipuli, keitetty, suolaton [D]                           | Valkosipuli                         | Onion cooked in vegetable bouillon and syrup [D] | Garlic                         |
| 6   | Sipuli, täytetty, riisi, sika-nautajauheliha [D]         | Purjosipuli                         | Onion, fried [D]                                 | Leek                           |
| 7   | Sipuli, paistettu, haudutettu, kasvisliemi, siirappi [D] | Ruohosipuli                         | Onion, boiled without salt [D]                   | Chives                         |
| 8   | Purjosipuli                                              | Purjosipuli, keitetty, suolaton [D] | Leek                                             | Leek, boiled without salt [D]  |

### `valkosipuli`

| #   | Before, Finnish names                                 | After, Finnish names                                  | Before, English names                                        | After, English names                                         |
| --- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | Valkosipuli                                           | Valkosipuli                                           | Garlic                                                       | Garlic                                                       |
| 2   | Valkosipulietana [D]                                  | Silli, valkosipuli-/sinappikastikkeessa               | Snails in garlic butter [D]                                  | Herring in garlic or mustard sauce                           |
| 3   | Valkosipuliperuna [D]                                 | Vaalea leipä, patonki, valkosipuli/yrttivoi [D]       | Scalloped garlic potatoes [D]                                | White bread, baguette, garlic butter/herb butter filling [D] |
| 4   | Silli, valkosipuli-/sinappikastikkeessa               | Yrttilevite, tuorejuusto, margariini, valkosipuli [D] | Herring in garlic or mustard sauce                           | Herb spread, cream cheese, margarine, garlic [D]             |
| 5   | Vaalea leipä, patonki, valkosipuli/yrttivoi [D]       | Valkosipulietana [D]                                  | White bread, baguette, garlic butter/herb butter filling [D] | Snails in garlic butter [D]                                  |
| 6   | Yrttilevite, tuorejuusto, margariini, valkosipuli [D] | Valkosipuliperuna [D]                                 | Herb spread, cream cheese, margarine, garlic [D]             | Scalloped garlic potatoes [D]                                |
| 7   | Vaalea leipä, valkosipulipatonki [D]                  | Vaalea leipä, valkosipulipatonki [D]                  | White bread, garlic baguette [D]                             | White bread, garlic baguette [D]                             |
| 8   | Katkarapu, chili-valkosipulimarinadi, paistettu [D]   | Katkarapu, chili-valkosipulimarinadi, paistettu [D]   | Fried shrimp with chili and garlic marinade, fried [D]       | Fried shrimp with chili and garlic marinade, fried [D]       |

### `tomaatti`

| #   | Before, Finnish names                            | After, Finnish names                                                     | Before, English names                         | After, English names                                                       |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Tomaatti                                         | Tomaatti                                                                 | Tomato                                        | Tomato                                                                     |
| 2   | Tomaatti, aurinkokuivattu, öljyssä               | Tomaatti, aurinkokuivattu, öljyssä                                       | Tomato, sun-dried, in oil                     | Tomato, sun-dried, in oil                                                  |
| 3   | Tomaatti, grillattu [D]                          | Tomaatti, grillattu [D]                                                  | Tomato, grilled [D]                           | Tomato, grilled [D]                                                        |
| 4   | Tomaatti, täytetty, sienitäyte, korppujauhoa [D] | Ateriankorvike, keittojauhe, tomaatti/texmex/thai, easy diet             | Tomato filled with mushrooms, breadcrumbs [D] | Meal replacement, soup powder, tomato/texmex/thai, easy diet               |
| 5   | Tomaattimurska                                   | Ateriankorvike, keittojauhe ja vesi, tomaatti/texmex/thai, easy diet [D] | Tomato puree                                  | Meal replacement, soup powder and water, tomato/texmex/thai, easy diet [D] |
| 6   | Tomaattisose, tomaattipyree                      | Tomaatti, täytetty, sienitäyte, korppujauhoa [D]                         | Tomatoes, crushed, canned                     | Tomato filled with mushrooms, breadcrumbs [D]                              |
| 7   | Tomaattisalsa [D]                                | Tomaattimurska                                                           | Tomato soup [D]                               | Tomatoes, crushed, canned                                                  |
| 8   | Tomaattikeitto [D]                               | Tomaattisose, tomaattipyree                                              | Tomato salsa [D]                              | Tomato puree                                                               |

### `kurkku`

| #   | Before, Finnish names                      | After, Finnish names                                      | Before, English names                            | After, English names                            |
| --- | ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| 1   | Kurkku                                     | Kurkku                                                    | Cucumber                                         | Cucumber                                        |
| 2   | Etikkakurkku, ei lisättyä sokeria          | Maustekurkku, herkkukurkku, sokerisuolattu                | Soured cucumber                                  | Pickled cucumber, sweet, flavoured              |
| 3   | Hapankurkku liemineen, venäläinen kurkku   | Etikkakurkku, ei lisättyä sokeria                         | Pickled cucumber, sweet, flavoured               | Cucumber, pickled cucumber, without added sugar |
| 4   | Maustekurkku, herkkukurkku, sokerisuolattu | Hapankurkku liemineen, venäläinen kurkku                  | Cucumber, pickled cucumber, without added sugar  | Soured cucumber                                 |
| 5   | Kurkkukeitto, kylmä [D]                    | Salaatti, kurkkusalaatti, kurkkupikkelssi, kurkkurelissi  | Cold cucumber soup [D]                           | Salad, sweet pickle relish                      |
| 6   | Salaatti, kaali-kurkku-purjo [D]           | Majoneesi, kurkkumajoneesi, hampurilaiskastike, hesburger | Sushi maki with cucumber and seaweed [D]         | Mayonnaise, cucumber mayonnaise, hesburger      |
| 7   | Salaatti, kaali-omena-maustekurkku [D]     | Salaatti, kaali-kurkku-purjo [D]                          | Salad, cucumber slices with dill and vinegar [D] | Sushi maki with cucumber and seaweed [D]        |
| 8   | Salaatti, kiinankaali-kurkku-tomaatti [D]  | Salaatti, kiinankaali-kurkku-tomaatti [D]                 | Salad, cabbage, cucumber and leek [D]            | Salad, cabbage, cucumber and leek [D]           |

### `porkkana`

| #   | Before, Finnish names                   | After, Finnish names                                                     | Before, English names            | After, English names                                                            |
| --- | --------------------------------------- | ------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Porkkana                                | Porkkana                                                                 | Carrot                           | Carrot                                                                          |
| 2   | Porkkana, kuivattu                      | Porkkana, kuivattu                                                       | Carrot, dried                    | Carrot, dried                                                                   |
| 3   | Porkkana, uunissa [D]                   | Porkkana, keitetty, suolaton [D]                                         | Carrot, baked [D]                | Carrot, boiled without salt [D]                                                 |
| 4   | Porkkana, paistettu [D]                 | Porkkana, keitetty, suolaa [D]                                           | Carrot, fried [D]                | Carrot, boiled, salt [D]                                                        |
| 5   | Porkkana, keitetty, suolaa [D]          | Sekavihannes, porkkana, kukkakaali, herne, papu                          | Carrot, boiled without salt [D]  | Mixed vegetables, carrot, cauliflower, pea, bean                                |
| 6   | Porkkana, keitetty, suolaton [D]        | Mehu, gefilus ananas-porkkana + kalsium, c- ja d-vit, prob, 09/12 alkaen | Carrot, boiled, salt [D]         | Juice drink, pineapple-carrot, gefilus, calcium, vitamin c and d, probiotics    |
| 7   | Porkkana, keitetty, suolaa ja öljyä [D] | Nuppuvihannes, keitetty, suolaton, kukkakaali, porkkana, parsakaali [D]  | Carrot, boiled, salt and oil [D] | Vegetable mix with cauliflower, broccoli, carrot, boiled without added salt [D] |
| 8   | Porkkanasurvos [D]                      | Porkkana, uunissa [D]                                                    | Carrot stew [D]                  | Carrot, baked [D]                                                               |

### `riisi`

| #   | Before, Finnish names                      | After, Finnish names                         | Before, English names                     | After, English names                      |
| --- | ------------------------------------------ | -------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| 1   | Riisi tumma                                | Riisi puuroutuva                             | Rice, brown                               | Rice, white                               |
| 2   | Riisi puuroutuva                           | Riisi pitkäjyväinen, puuroutumaton           | Rice, white                               | Rice, white, long-grain, parboiled        |
| 3   | Riisi pitkäjyväinen, puuroutumaton         | Riisi tumma                                  | Rice, white, long-grain, parboiled        | Rice, brown                               |
| 4   | Riisi, keitetty, suolaa [D]                | Riisi, keitetty, suolaa [D]                  | Rice, boiled without salt [D]             | Rice, boiled, salt [D]                    |
| 5   | Riisi, keitetty, suolaton [D]              | Riisi, keitetty, suolaton [D]                | Rice, boiled, salt [D]                    | Rice, boiled without salt [D]             |
| 6   | Riisi, tumma, keitetty, suolaa [D]         | Riisi, pitkäjyväinen, keitetty, suolaa [D]   | Rice, brown, boiled without salt [D]      | Rice, long-grain, boiled, salt [D]        |
| 7   | Riisi, tumma, keitetty, suolaton [D]       | Riisi, pitkäjyväinen, keitetty, suolaton [D] | Rice, long-grain, boiled without salt [D] | Rice, long-grain, boiled without salt [D] |
| 8   | Riisi, pitkäjyväinen, keitetty, suolaa [D] | Riisi, tumma, keitetty, suolaa [D]           | Rice, brown, boiled, salt [D]             | Rice, brown, boiled without salt [D]      |

### `pasta`

| #   | Before, Finnish names                               | After, Finnish names                                  | Before, English names                               | After, English names                                  |
| --- | --------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------- |
| 1   | Pasta, vehnänalkiopasta                             | Pasta, spagetti, makaroni                             | Pasta, wheat germ pasta                             | Pasta, spaghetti, macaroni                            |
| 2   | Pasta, tumma proteiinipasta                         | Pasta, täysjyväriisijauho, luontaisesti gluteeniton   | Fresh pasta, contains egg                           | Pasta, wholegrain rice flour, naturally gluten-free   |
| 3   | Pasta, spagetti, makaroni                           | Pasta, kuitupitoinen, luontaisesti gluteeniton        | Pasta, dark high protein pasta                      | Pasta, rich in fiber, naturally gluten-free           |
| 4   | Pasta, tuorepasta, kananmunaa                       | Pasta, spagetti, makaroni, luontaisesti gluteeniton   | Spaghetti spinach, contains egg                     | Pasta, multigrain, wheat, rye and barley              |
| 5   | Pasta, gluteeniton, tuotekeskiarvo                  | Pasta, spagetti, luontaisesti gluteeniton, kananmunaa | Pasta, spaghetti, macaroni                          | Pasta, spaghetti, macaroni, naturally gluten-free     |
| 6   | Pasta, pinaattispagetti, sisältää kananmunaa        | Pasta, moniviljapasta, vehnä, ruis, ohra              | Pasta, rich in fiber, naturally gluten-free         | Pasta, spaghetti, naturally gluten-free, contains egg |
| 7   | Pasta, kuitupitoinen, luontaisesti gluteeniton      | Pasta, vehnänalkiopasta                               | Pasta, gluten-free, average of industrial products  | Pasta, wheat germ pasta                               |
| 8   | Pasta, täysjyväriisijauho, luontaisesti gluteeniton | Pasta, tumma proteiinipasta                           | Pasta, wholegrain rice flour, naturally gluten-free | Fresh pasta, contains egg                             |

### `makaroni`

| #   | Before, Finnish names          | After, Finnish names                    | Before, English names                            | After, English names                             |
| --- | ------------------------------ | --------------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| 1   | Makaroni, pasta                | Makaroni, pasta                         | Rye macaroni                                     | Macaroni, pasta                                  |
| 2   | Makaroni, tumma                | Makaroni, tumma                         | Macaroni, pasta                                  | Macaroni, whole wheat                            |
| 3   | Makaroni, täysjyvä             | Makaroni, täysjyvä                      | Macaroni, gluten-free                            | Rye macaroni                                     |
| 4   | Makaroni, gluteeniton          | Makaroni, gluteeniton                   | Macaroni, whole wheat                            | Macaroni, gluten-free                            |
| 5   | Makaroni, ruismakaroni         | Makaroni, ruismakaroni                  | Macaroni, pasta, contains egg                    | Macaroni, dark, whole wheat and dark wheat flour |
| 6   | Makaroni, pasta, kananmunaa    | Makaroni, pasta, kananmunaa             | Macaroni, dark, whole wheat and dark wheat flour | Macaroni, pasta, contains egg                    |
| 7   | Makaroni, paistettu [D]        | Makaroni, keitetty, suolaa [D]          | Macaroni, fried [D]                              | Macaroni, boiled, salt [D]                       |
| 8   | Makaroni, keitetty, suolaa [D] | Makaroni, tumma, keitetty, suolaton [D] | Macaroni, boiled without salt [D]                | Macaroni, dark, boiled without salt [D]          |

### `jauho`

| #   | Before, Finnish names     | After, Finnish names                                | Before, English names                | After, English names                                    |
| --- | ------------------------- | --------------------------------------------------- | ------------------------------------ | ------------------------------------------------------- |
| 1   | Jauho, ohrajauho          | Jauho, vehnäjauho, puolikarkea                      | Flour, oat flour                     | Flour, wheat flour, semi-coarse                         |
| 2   | Jauho, kaurajauho         | Jauho, korppujauho                                  | Flour, breadcrumbs                   | Flour, breadcrumbs                                      |
| 3   | Jauho, grahamjauho        | Jauho, perunajauho tai -suurimo, perunatärkkelys    | Flour, barley flour                  | Flour, potato starch, potato flour                      |
| 4   | Jauho, korppujauho        | Jauho, ruisjauho, kokojyväjauho                     | Flour, dark wheat flour              | Flour, rye, wholegrain rye flour                        |
| 5   | Jauho, ruissihtijauho     | Jauho, maissitärkkelys                              | Spelt flour, whole meal              | Flour, cornstarch, cornflour                            |
| 6   | Jauho, maissitärkkelys    | Jauho, hiivaleipävehnäjauho                         | Flour, coarse wheat flour            | Flour, dark wheat flour                                 |
| 7   | Jauho, täysjyväohrajauho  | Jauho, vehnäjauho, leipomoteollisuus, vastajauhettu | Flour mixture, naturally gluten-free | Flour, wheat flour, semi-coarse, bakery industry, fresh |
| 8   | Jauho, täysjyväriisijauho | Jauho, grahamjauho                                  | Flour mixture, rye, wheat            | Flour, whole wheat flour, graham flour                  |

### `sokeri`

| #   | Before, Finnish names                                               | After, Finnish names                                                | Before, English names                       | After, English names                        |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------- |
| 1   | Sokeri                                                              | Sokeri                                                              | Sugar                                       | Sugar                                       |
| 2   | Vanilliinisokeri                                                    | Vanilliinisokeri                                                    | Glucose                                     | Vanillin sugar                              |
| 3   | Rypälesokeri, glukoosi                                              | Rypälesokeri, glukoosi                                              | Vanillin sugar                              | Glucose                                     |
| 4   | Sokerivesikuorrutus [D]                                             | Soijajuoma, alpro kalsiumsoijajuoma, sokeri, kalsiumia, vitamiineja | Icing [D]                                   | Soya drink, sugar, calcium, vitamins, alpro |
| 5   | Sokeririnkeli, kevytmaito [D]                                       | Fruktoosi, hedelmäsokeri                                            | Bagel, sweet, low-fat milk [D]              | Fructose                                    |
| 6   | Fruktoosi, hedelmäsokeri                                            | Sokerivesikuorrutus [D]                                             | Fructose                                    | Icing [D]                                   |
| 7   | Soijajuoma, alpro kalsiumsoijajuoma, sokeri, kalsiumia, vitamiineja | Kaakaojauhe, ei lisättyä sokeria                                    | Soya drink, sugar, calcium, vitamins, alpro | Cocoa powder, unsweetened                   |
| 8   | Hedelmähyytelö, hyytelösokeri [D]                                   | Maustekurkku, herkkukurkku, sokerisuolattu                          | Fruit jelly [D]                             | Pickled cucumber, sweet, flavoured          |

### `suola`

| #   | Before, Finnish names                     | After, Finnish names                          | Before, English names           | After, English names                                 |
| --- | ----------------------------------------- | --------------------------------------------- | ------------------------------- | ---------------------------------------------------- |
| 1   | Aromisuola/yrttisuola suolapitoisuus 71 % | Ruokasuola, jodioitu                          | Salt, iodised                   | Salt, iodised                                        |
| 2   | Ruokasuola, jodioitu                      | Ruokasuola, jodioimaton, vuorisuola           | Salt, low sodium                | Salt, rock salt, without iodine                      |
| 3   | Merisuola, jodioimaton                    | Aromisuola/yrttisuola suolapitoisuus 71 %     | Seasalt, without iodine         | Aromatic salt, 71% salt content                      |
| 4   | Mineraalisuola, keskiarvo                 | Merisuola, jodioimaton                        | Aromatic salt, 71% salt content | Salt, low sodium                                     |
| 5   | Ruokasuola, jodioimaton, vuorisuola       | Mineraalisuola, keskiarvo                     | Salt, rock salt, without iodine | Seasalt, without iodine                              |
| 6   | Suolarinkeli, kova                        | Rasvaseoslevite 82%, ingmariini merisuola, vl | Pretzel, hard                   | Blended spread 82%, ingmariini sea salt, low-lactose |
| 7   | Suolarinkeli, pehmeä                      | Suolarinkeli, kova                            | Pretzel, soft                   | Pretzel, hard                                        |
| 8   | Suolatikku [D]                            | Suolarinkeli, pehmeä                          | Salt stick [D]                  | Pretzel, soft                                        |

### `öljy`

| #   | Before, Finnish names | After, Finnish names                                                 | Before, English names | After, English names                                              |
| --- | --------------------- | -------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------- |
| 1   | Palmuöljy             | Ruokaöljy keskiarvo, 87 % rypsi- 8 % auringonkukka- ja 5% oliiviöljy | Palm oil              | Cooking oil, average, 87% rapeseed, 8% sunflower,and 5% olive oil |
| 2   | Rypsiöljy             | Oliiviöljy                                                           | Olive oil             | Olive oil                                                         |
| 3   | Soijaöljy             | Ruokaöljy teollisuuskäyttöön, 70 % rypsiöljyä, 30 % palmuöljyä       | Peanut oil            | Catering oil, 70% rapeseed oil, 30% palm oil                      |
| 4   | Kookosöljy            | Rypsiöljy                                                            | Avocado oil           | Rapeseed oil                                                      |
| 5   | Maissiöljy            | Palmuöljy                                                            | Coconut oil           | Palm oil                                                          |
| 6   | Oliiviöljy            | Kookosöljy                                                           | Soybean oil           | Coconut oil                                                       |
| 7   | Avokadoöljy           | Auringonkukkaöljy                                                    | Rapeseed oil          | Sunflower oil                                                     |
| 8   | Pellavaöljy           | Soijaöljy                                                            | Sunflower oil         | Peanut oil                                                        |

### `oliiviöljy`

| #   | Before, Finnish names                                                         | After, Finnish names                                                          | Before, English names                                                              | After, English names                                                               |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Oliiviöljy                                                                    | Oliiviöljy                                                                    | Olive oil                                                                          | Olive oil                                                                          |
| 2   | Ruokaöljy keskiarvo, 87 % rypsi- 8 % auringonkukka- ja 5% oliiviöljy          | Ruokaöljy keskiarvo, 87 % rypsi- 8 % auringonkukka- ja 5% oliiviöljy          | Cooking oil, average, 87% rapeseed, 8% sunflower,and 5% olive oil                  | Cooking oil, average, 87% rapeseed, 8% sunflower,and 5% olive oil                  |
| 3   | Tapas, marinoidut herkkusienet, oliiviöljy [D]                                | Tapas, marinoidut herkkusienet, oliiviöljy [D]                                | Salad, avocado potato salad, olive oil [D]                                         | Salad, avocado potato salad, olive oil [D]                                         |
| 4   | Salaatti, avokado-perunasalaatti, oliiviöljy [D]                              | Salaatti, avokado-perunasalaatti, oliiviöljy [D]                              | Tapas, marinated champignon, olive oil [D]                                         | Tapas, marinated champignon, olive oil [D]                                         |
| 5   | Tapas, tuorejuustotäytteinen jalapeno, oliiviöljy [D]                         | Tapas, tuorejuustotäytteinen jalapeno, oliiviöljy [D]                         | Tapas, cream cheese-filled jalapeno pepper, olive oil [D]                          | Tapas, cream cheese-filled jalapeno pepper, olive oil [D]                          |
| 6   | Vaalea leipä, arinaleipä, leipäaitta, lidl, oliiviöljy, voimakassuolainen [D] | Vaalea leipä, arinaleipä, leipäaitta, lidl, oliiviöljy, voimakassuolainen [D] | White bread, wheat flour, olive oil, high sodium, arinaleipä, leipäaitta, lidl [D] | White bread, wheat flour, olive oil, high sodium, arinaleipä, leipäaitta, lidl [D] |

### `broileri`

| #   | Before, Finnish names                         | After, Finnish names                          | Before, English names              | After, English names                     |
| --- | --------------------------------------------- | --------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| 1   | Broileri, koipi-reisi, nahaton                | Broileri, rintafilee, nahaton, suikale, leike | Chicken with skin                  | Chicken breast strips without skin       |
| 2   | Broileri, rintaleike, nahkoineen              | Broileri, koipi-reisi, nahaton                | Chicken breast with skin           | Chicken with skin                        |
| 3   | Broileri, koipi nahkoineen, raaka             | Broileri, koipi nahkoineen, raaka             | Chicken leg and thigh with skin    | Chicken leg and thigh with skin          |
| 4   | Broileri, kokonainen, nahkoineen, raaka       | Broileri, kokonainen, nahkoineen, raaka       | Chicken breast strips without skin | Chicken leg and thigh without skin       |
| 5   | Broileri, koipi-reisi, nahkoineen, raaka      | Broileri, koipi-reisi, nahkoineen, raaka      | Chicken leg and thigh without skin | Chicken drumstick with skin, raw         |
| 6   | Broileri, marinoitu, ilman nahkaa, raaka      | Broileri, rintaleike, nahkoineen              | Chicken marinated, without skin    | Chicken breast with skin                 |
| 7   | Broileri, rintafilee, nahaton, suikale, leike | Broileri, marinoitu, ilman nahkaa, raaka      | Chicken drumstick with skin, raw   | Chicken marinated, without skin          |
| 8   | Broileri, öljykastikkeessa, grillattu [D]     | Broileri, koipi, nahkoineen, uunissa [D]      | Orange chicken [D]                 | Chicken drumstick with skin, grilled [D] |

### `lohi`

| #   | Before, Finnish names                      | After, Finnish names             | Before, English names                          | After, English names             |
| --- | ------------------------------------------ | -------------------------------- | ---------------------------------------------- | -------------------------------- |
| 1   | Lohi, öljyssä                              | Lohi, tuoresuolattu              | Salmon, whole                                  | Salmon, salt-cured               |
| 2   | Lohi, kasvatettu                           | Lohi, lämminsavustettu           | Salmon, farmed                                 | Salmon, warm smoked              |
| 3   | Lohi, kokonainen                           | Lohi, öljyssä                    | Salmon, salt-cured                             | Salmon, whole                    |
| 4   | Lohi, tuoresuolattu                        | Lohi, kasvatettu                 | Salmon, warm smoked                            | Salmon, farmed                   |
| 5   | Lohi, lämminsavustettu                     | Lohi, kokonainen                 | Salmon in oil, canned                          | Salmon in oil, canned            |
| 6   | Lohi, keitetty, suolaton [D]               | Lohi, keitetty, suolaton [D]     | Salmon, boiled, without salt [D]               | Salmon, boiled, without salt [D] |
| 7   | Lohi tai kirjolohi, keitetty, suolaton [D] | Kirjolohi, kasvatettu            | Salmon/rainbow trout, boiled, without salt [D] | Rainbow trout, farmed            |
| 8   | Kirjolohi, kasvatettu                      | Kirjolohi, kokonainen, keskiarvo | Rainbow trout, farmed                          | Rainbow trout, whole, average    |

### `tonnikala`

| #   | Before, Finnish names                             | After, Finnish names                              | Before, English names                  | After, English names                 |
| --- | ------------------------------------------------- | ------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| 1   | Tonnikala                                         | Tonnikala, keskiarvo                              | Tuna                                   | Tuna, average                        |
| 2   | Tonnikala, keskiarvo                              | Tonnikala, öljyssä, säilyke                       | Tuna, average                          | Tuna, in oil, canned                 |
| 3   | Tonnikala, vedessä, säilyke                       | Tonnikala, vedessä, säilyke                       | Tuna, in oil, canned                   | Tuna, in water, canned               |
| 4   | Tonnikala, öljyssä, säilyke                       | Tonnikala                                         | Tuna, in water, canned                 | Tuna                                 |
| 5   | Tonnikala, paistettu [D]                          | Tonnikala, paistettu [D]                          | Tuna, fried [D]                        | Tuna, fried [D]                      |
| 6   | Tonnikala-makaronimuhennos, tonnikala vedessä [D] | Voileipäkakku, tonnikala [D]                      | Macaroni stew with tuna [D]            | Macaroni stew with tuna [D]          |
| 7   | Tonnikalapasta, saarioinen, valmisateria [D]      | Pizza, tonnikala-katkarapu-simpukkapizza [D]      | Tuna pasta, saarioinen, ready meal [D] | Sushi maki with tuna and seaweed [D] |
| 8   | Voileipäkakku, tonnikala [D]                      | Tonnikala-makaronimuhennos, tonnikala vedessä [D] | Sushi maki with tuna and seaweed [D]   | Savoury sandwich cake, tuna [D]      |

### `jauheliha`

| #   | Before, Finnish names                        | After, Finnish names                         | Before, English names    | After, English names     |
| --- | -------------------------------------------- | -------------------------------------------- | ------------------------ | ------------------------ |
| 1   | Jauheliha, broilerin                         | Jauheliha, sika-nauta                        | Chicken mince            | Pork beef mince          |
| 2   | Jauheliha, sika-nauta                        | Jauheliha, naudanpaisti, rasvaa 9 %          | Pork beef mince          | Lean steak mince, 9% fat |
| 3   | Jauheliha, sian, rasvaa 16 %                 | Jauheliha, naudan, rasvaa 17 %               | Beef mince, 17% fat      | Beef mince, 17% fat      |
| 4   | Jauheliha, naudan, rasvaa 17 %               | Jauheliha, broilerin                         | Lamb mince, 14% fat      | Chicken mince            |
| 5   | Jauheliha, lampaan, rasvaa 14 %              | Jauheliha, naudan, vähärasvainen, rasvaa 7 % | Pork mince, fat 16 %     | Lean steak mince, 7% fat |
| 6   | Jauheliha, kalkkunan, rasvaa 5-6 %           | Jauheliha, sian, rasvaa 16 %                 | Turkey mince, fat 5-6%   | Lamb mince, 14% fat      |
| 7   | Jauheliha, naudanpaisti, rasvaa 9 %          | Jauheliha, lampaan, rasvaa 14 %              | Lean steak mince, 7% fat | Pork mince, fat 16 %     |
| 8   | Jauheliha, naudan, vähärasvainen, rasvaa 7 % | Jauheliha, kalkkunan, rasvaa 5-6 %           | Lean steak mince, 9% fat | Turkey mince, fat 5-6%   |

### `pekoni`

| #   | Before, Finnish names                           | After, Finnish names                            | Before, English names                                   | After, English names                                    |
| --- | ----------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Pekoni, 32 % rasvaa                             | Pekoni, 32 % rasvaa                             | Bacon                                                   | Bacon                                                   |
| 2   | Pekoni, filee, rasvaa 18 %                      | Pekoni, filee, rasvaa 18 %                      | Bacon, fillet, 18% fat                                  | Bacon, fillet, 18% fat                                  |
| 3   | Pekoni, paistettu [D]                           | Pekoni, paistettu [D]                           | Bacon, fried [D]                                        | Bacon, fried [D]                                        |
| 4   | Pekoni, filee, rasvaa 18 %, paistettu [D]       | Pekoni, filee, rasvaa 18 %, paistettu [D]       | Bacon, fillet, 18% fat, fried [D]                       | Bacon, fillet, 18% fat, fried [D]                       |
| 5   | Pasta carbonara, pekoni [D]                     | Pasta carbonara, pekoni [D]                     | Liver stew with bacon [D]                               | Liver stew with bacon [D]                               |
| 6   | Maksapata, maksa, pekoni [D]                    | Maksapata, maksa, pekoni [D]                    | Mushrooms filled with bacon and processed cheese [D]    | Mushrooms filled with bacon and processed cheese [D]    |
| 7   | Herkkusieni, täytetty, tuorejuusto, pekoni [D]  | Herkkusieni, täytetty, tuorejuusto, pekoni [D]  | Mushrooms filled with bacon and cream cheese spread [D] | Mushrooms filled with bacon and cream cheese spread [D] |
| 8   | Herkkusieni, täytetty, sulatejuusto, pekoni [D] | Herkkusieni, täytetty, sulatejuusto, pekoni [D] | Hamburger, baconburger [D]                              | Hamburger, baconburger [D]                              |

### `kaurahiutale`

| #   | Before, Finnish names                                                      | After, Finnish names                                                       | Before, English names                                                      | After, English names                                                       |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Kaurahiutale                                                               | Kaurahiutale                                                               | Oats, rolled, oat flakes                                                   | Oats, rolled, oat flakes                                                   |
| 2   | Sekaleipä, kauraleipä, fazer, vehnäjauho, kaurahiutale [D]                 | Sekaleipä, kauraleipä, fazer, vehnäjauho, kaurahiutale [D]                 | Toast, oats toast, fazer kaurapaahto [D]                                   | Toast, oats toast, fazer kaurapaahto [D]                                   |
| 3   | Sekaleipä, kauraleipä, kevytmaito, vehnäjauho, kaurahiutale [D]            | Sekaleipä, kauraleipä, kevytmaito, vehnäjauho, kaurahiutale [D]            | Toast, oats toast, oat flour, oat flakes [D]                               | Toast, oats toast, oat flour, oat flakes [D]                               |
| 4   | Paahtoleipä, kaurapaahtoleipä, vesi, vehnäjauho, kaurahiutale [D]          | Paahtoleipä, kaurapaahtoleipä, vesi, vehnäjauho, kaurahiutale [D]          | Crispbread, wasa oat, oat and wheat flour, oat flakes [D]                  | Crispbread, wasa oat, oat and wheat flour, oat flakes [D]                  |
| 5   | Paahtoleipä, kaurapaahto, fazer, vehnäjauho, kaurahiutale,-kuitu [D]       | Paahtoleipä, kaurapaahto, fazer, vehnäjauho, kaurahiutale,-kuitu [D]       | Multigrain bread, oat bread, wheat flour, oat flakes, fazer [D]            | Multigrain bread, oat bread, wheat flour, oat flakes, fazer [D]            |
| 6   | Sekaleipä, kaurasämpylä, kevytmaito, hiivaleipäjauho, kaurahiutale [D]     | Sekaleipä, kaurasämpylä, kevytmaito, hiivaleipäjauho, kaurahiutale [D]     | Multigrain bread, oat bread, low-fat milk, wheat flour, oat flakes [D]     | Multigrain bread, oat bread, low-fat milk, wheat flour, oat flakes [D]     |
| 7   | Näkkileipä, kauranäkkileipä, wasa, kaura-, vehnäjauho, kaurahiutale [D]    | Näkkileipä, kauranäkkileipä, wasa, kaura-, vehnäjauho, kaurahiutale [D]    | Multigrain bread, oat bread, perinteinen kauraleipä, leipäaitta, lidl [D]  | Multigrain bread, oat bread, perinteinen kauraleipä, leipäaitta, lidl [D]  |
| 8   | Sekaleipä, ohraleipä, kevytmaito, hiivaleipä-, ohrajauho, kaurahiutale [D] | Sekaleipä, ohraleipä, kevytmaito, hiivaleipä-, ohrajauho, kaurahiutale [D] | Multigrain bread, oat roll, low-fat milk, dark wheat flour, oat flakes [D] | Multigrain bread, oat roll, low-fat milk, dark wheat flour, oat flakes [D] |

### `banaani`

| #   | Before, Finnish names                             | After, Finnish names                                      | Before, English names                         | After, English names                          |
| --- | ------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| 1   | Banaani, kuorittu                                 | Banaani, kuorittu                                         | Banana, with skin                             | Banana, without skin                          |
| 2   | Banaani, punnittu kuorineen                       | Banaani, punnittu kuorineen                               | Banana, without skin                          | Banana, with skin                             |
| 3   | Banaani, friteerattu, uppopaistettu [D]           | Banaanilastu, kuivattu banaani                            | Banana, deep-fried [D]                        | Banana chip                                   |
| 4   | Uunibanaani [D]                                   | Banaanilastu, kuivattu banaani, jogurttikuorrutus         | Baked banana [D]                              | Banana chips coated with yoghurt              |
| 5   | Banaanilastu, kuivattu banaani                    | Banaani, friteerattu, uppopaistettu [D]                   | Banana chip                                   | Banana, deep-fried [D]                        |
| 6   | Banaanilastu, kuivattu banaani, jogurttikuorrutus | Uunibanaani [D]                                           | Banana chips coated with yoghurt              | Baked banana [D]                              |
| 7   | Banaanipannukakku [D]                             | Muro, weetabix, banaani, muroke [D]                       | Banana egg pancake [D]                        | Breakfast cereal, weetabix banana flavour [D] |
| 8   | Muro, weetabix, banaani, muroke [D]               | Hedelmäsalaatti, appelsiini, banaani, omena, persikka [D] | Breakfast cereal, weetabix banana flavour [D] | Fruit salad, orange, banana, apple, grape [D] |

## Everyday ingredients, English

### `milk`

| #   | Before, Finnish names               | After, Finnish names                                         | Before, English names                   | After, English names                               |
| --- | ----------------------------------- | ------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------- |
| 1   | Maitojauhe, rasvaton                | Maito, kevytmaito, d-vitamiinia 1 ug                         | Milk, goat milk                         | Milk, 1.5% fat, 1 ug added vitamin d               |
| 2   | Maitojauhe, rasvaton, vl            | Maito, rasvaton, d-vitamiinia 1 ug                           | Milk powder, fat-free milk              | Milk, 0% fat, i ug added vitamin d                 |
| 3   | Maito, kutunmaito, vuohenmaito      | Maito, täysmaito, d-vitamiinia 1 ug                          | Milk, 0% fat, i ug added vitamin d      | Milk, 3.5% fat, 1 ug added vitamin d               |
| 4   | Maitojauhe, rasvaton, laktoositon   | Maitojauhe, rasvaton                                         | Milk, 1% fat, 1 ug added vitamin d      | Milk powder, fat-free milk                         |
| 5   | Maito, rasvaton, d-vitamiinia 1 ug  | Maito, kevytmaito, ei lisätty d-vitamiinia, luomu            | Milk, average, 1 ug added vitamin d     | Milk, 1.5% fat, without added vitamin d, organic   |
| 6   | Maito, keskiarvo, d-vitamiinia 1 ug | Maito, kevytmaito, laktoositon maitojuoma, d-vitamiinia 1 ug | Milk, 1.5% fat, 1 ug added vitamin d    | Milk, 1.5% fat, lactose-free, 1 ug added vitamin d |
| 7   | Maito, täysmaito, d-vitamiinia 1 ug | Maito, rasvaton, ei lisätty d-vitamiinia, luomu              | Milk, 3.5% fat, 1 ug added vitamin d    | Milk, 0% fat, without added vitamin d, organic     |
| 8   | Maito, ykkösmaito, d-vitamiinia 1ug | Maito, kevytmaito, vl, d-vitamiinia 1 ug                     | Milk powder, fat-free milk, low-lactose | Milk, 1.5% fat, low-lactose, 1 ug added vitamin d  |

### `chicken`

| #   | Before, Finnish names            | After, Finnish names                          | Before, English names           | After, English names                  |
| --- | -------------------------------- | --------------------------------------------- | ------------------------------- | ------------------------------------- |
| 1   | Kana                             | Broilerisuikale                               | Chicken                         | Chicken strips                        |
| 2   | Broilerisuikale                  | Broileri, rintafilee, nahaton, suikale, leike | Chicken mince                   | Chicken breast strips without skin    |
| 3   | Jauheliha, broilerin             | Jauheliha, broilerin                          | Chicken strips                  | Chicken mince                         |
| 4   | Broilerin siipi, nahaton         | Kana                                          | Chicken with skin               | Chicken                               |
| 5   | Broilerin siipi, nahkoineen      | Kanaliemikuutio, sisältää vehnää              | Chicken wing with skin          | Chicken bouillon cube, contains wheat |
| 6   | Kanaliemikuutio, sisältää vehnää | Broilerifilee, hunajamarinadi, raaka          | Chicken breast with skin        | Chicken fillet in honey marinade      |
| 7   | Broileri, koipi-reisi, nahaton   | Broileri, koipi-reisi, nahaton                | Chicken wing without skin       | Chicken with skin                     |
| 8   | Broileri, rintaleike, nahkoineen | Broileri, koipi nahkoineen, raaka             | Chicken leg and thigh with skin | Chicken leg and thigh with skin       |

### `beef`

| #   | Before, Finnish names   | After, Finnish names                    | Before, English names | After, English names      |
| --- | ----------------------- | --------------------------------------- | --------------------- | ------------------------- |
| 1   | Lihahyytelö             | Jauheliha, naudan, rasvaa 17 %          | Beef flank            | Beef mince, 17% fat       |
| 2   | Naudankylki             | Naudanpaisti                            | Beef jelly            | Beef round                |
| 3   | Naudanpotka             | Naudanlapa/etuselkä, naudan keittoliha  | Beef round            | Beef, average             |
| 4   | Naudanrinta             | Naudanliha, rasvainen, keskiarvo        | Beef brisket          | Beef chuck, beef shoulder |
| 5   | Naudanpaisti            | Naudanfilee, ulkofilee                  | Beef knuckle          | Beef sirloin              |
| 6   | Naudanfilee, sisäfilee  | Naudanfilee, sisäfilee                  | Beef sirloin          | Beef tenderloin           |
| 7   | Naudanfilee, ulkofilee  | Naudanruho, keskirasvainen, 13 % rasvaa | Beef tenderloin       | Beef, medium fat, 13% fat |
| 8   | Lihasäilyke, naudanliha | Naudanpotka                             | Beef, canned          | Beef brisket              |

### `onion`

| #   | Before, Finnish names               | After, Finnish names           | Before, English names                            | After, English names                             |
| --- | ----------------------------------- | ------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| 1   | Sipuli, kuivattu                    | Sipuli, keltasipuli            | Onion                                            | Onion                                            |
| 2   | Sipuli, punasipuli                  | Sipuli, punasipuli             | Onion, dried                                     | Onion, red onion                                 |
| 3   | Sipuli, keltasipuli                 | Sipuli, kuivattu               | Onion, red onion                                 | Onion, dried                                     |
| 4   | Sipulikeitto [D]                    | Sipuli, keitetty, suolaton [D] | Onion soup [D]                                   | Onion, boiled without salt [D]                   |
| 5   | Sipuli, paistettu [D]               | Sipulikeitto [D]               | Onion stuffed with rice and pork beef mince [D]  | Onion soup [D]                                   |
| 6   | Sipulipiirakka, muropohja [D]       | Sipuli, paistettu [D]          | Onion cooked in vegetable bouillon and syrup [D] | Onion stuffed with rice and pork beef mince [D]  |
| 7   | Sipulimuhennos, kevytmaito [D]      | Sipulipiirakka, muropohja [D]  | Onion, fried [D]                                 | Onion cooked in vegetable bouillon and syrup [D] |
| 8   | Sipulikeitto, juustokuorrutettu [D] | Sipulimuhennos, kevytmaito [D] | Onion stew, low-fat milk [D]                     | Onion, fried [D]                                 |

### `butter`

| #   | Before, Finnish names           | After, Finnish names            | Before, English names           | After, English names            |
| --- | ------------------------------- | ------------------------------- | ------------------------------- | ------------------------------- |
| 1   | Voi                             | Voi                             | Butter                          | Butter                          |
| 2   | Voi, suolaton                   | Voi, suolaton                   | Butter lactose-free             | Butter, unsalted                |
| 3   | Voi, laktoositon                | Voi, laktoositon                | Butter, unsalted                | Butter lactose-free             |
| 4   | Voi, vähäsuolainen              | Voi, vähäsuolainen              | Butter, low-sodium              | Butter, low-sodium              |
| 5   | Voi, voimakassuolainen          | Voi, voimakassuolainen          | Butter, high-sodium             | Butter, high-sodium             |
| 6   | Voiöljy 100%, maitorasvaa       | Voiöljy 100%, maitorasvaa       | Butter oil 100%, milkfat        | Butter oil 100%, milkfat        |
| 7   | Voi, laktoositon, vähäsuolainen | Voi, laktoositon, vähäsuolainen | Butter lactose-free, low sodium | Butter lactose-free, low sodium |
| 8   | Rahkavoitaikina [D]             | Kookosrasva 100 %               | Butter chicken [D]              | Coconut butter                  |

### `oats`

| #   | Before, Finnish names                                             | After, Finnish names                                              | Before, English names                                          | After, English names                                           |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Kaurahiutale                                                      | Kaurahiutale                                                      | Oats, rolled, oat flakes                                       | Oats, rolled, oat flakes                                       |
| 2   | Nyhtökaura                                                        | Kauramakaroni, sisältää vehnää ja kauraa                          | Pulled oats                                                    | Oat macaroni, contains wheat and oats                          |
| 3   | Kauramakaroni, sisältää vehnää ja kauraa                          | Nyhtökaura                                                        | Oat macaroni, contains wheat and oats                          | Pulled oats                                                    |
| 4   | Papu, härkäpapu, kuivattu, härkäpapurouhe                         | Jauho, jauhoseos, sämpyläjauho, vehnäjauho, ruisjauho, vehnärouhe | Bean, broad bean, fava bean, dry, broad bean groats            | Flour mixture, for bread rolls, wheat flour, wheat groats, rye |
| 5   | Jauho, jauhoseos, sämpyläjauho, vehnäjauho, ruisjauho, vehnärouhe | Papu, härkäpapu, kuivattu, härkäpapurouhe                         | Flour mixture, for bread rolls, wheat flour, wheat groats, rye | Bean, broad bean, fava bean, dry, broad bean groats            |
| 6   | Mysli, kilomysli, pirkka [D]                                      | Mysli, kilomysli, pirkka [D]                                      | Toast, oats toast, fazer kaurapaahto [D]                       | Toast, oats toast, fazer kaurapaahto [D]                       |
| 7   | Paahtoleipä, paahtosämpylä kaura-juusto, fazer [D]                | Paahtoleipä, paahtosämpylä kaura-juusto, fazer [D]                | Toast, oats and cheese, fazer roast rolls [D]                  | Toast, oats and cheese, fazer roast rolls [D]                  |
| 8   | Paahtoleipä, kaurapaahtoleipä, vesi, vehnäjauho, kaurahiutale [D] | Paahtoleipä, kaurapaahtoleipä, vesi, vehnäjauho, kaurahiutale [D] | Toast, oats toast, oat flour, oat flakes [D]                   | Toast, oats toast, oat flour, oat flakes [D]                   |

### `apple`

| #   | Before, Finnish names                   | After, Finnish names                    | Before, English names               | After, English names                |
| --- | --------------------------------------- | --------------------------------------- | ----------------------------------- | ----------------------------------- |
| 1   | Omenahillo                              | Omena, keskiarvo, punnittu kuorineen    | Apple jam                           | Apple, average, with skin           |
| 2   | Omenalastu                              | Omena, ulkomainen, kuorittu             | Apple chips                         | Apple, imported, without skin       |
| 3   | Omena, kuivattu                         | Omena, kotimainen, kuorittu             | Apple, dried                        | Apple, domestic, without skin       |
| 4   | Omena, kotimainen, kuorittu             | Omena, kuivattu                         | Apple, average, with skin           | Apple, dried                        |
| 5   | Omena, ulkomainen, kuorittu             | Täysmehu, omenatäysmehu, c-vitamiinia   | Apple, domestic, without skin       | Apple juice, unsweetened, vitamin c |
| 6   | Omena, keskiarvo, punnittu kuorineen    | Omenahillo                              | Apple, imported, without skin       | Apple jam                           |
| 7   | Täysmehu, omenatäysmehu, c-vitamiinia   | Omenalastu                              | Apple juice, unsweetened, vitamin c | Apple chips                         |
| 8   | Omena, kotimainen, keskiarvo, kuorineen | Omena, kotimainen, keskiarvo, kuorineen | Apple, domestic, average, with skin | Apple, domestic, average, with skin |

### `potato`

| #   | Before, Finnish names                                | After, Finnish names                                 | Before, English names                     | After, English names                      |
| --- | ---------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| 1   | Perunalastu                                          | Peruna, vanha, kuorittu                              | Potato, new                               | Potato, peeled                            |
| 2   | Peruna, uusi                                         | Peruna, punnittu kuorineen                           | Potato, dried                             | Potato, unpeeled, avarage, raw            |
| 3   | Peruna, kuivattu                                     | Peruna, uusi                                         | Potato, peeled                            | Potato, new                               |
| 4   | Peruna, punnittu kuorineen                           | Perunalastu                                          | Potato crisps, potato chips, potato snack | Potato, dried                             |
| 5   | Peruna, vanha, kuorittu                              | Peruna, kuivattu                                     | Potato, unpeeled, avarage, raw            | Potato crisps, potato chips, potato snack |
| 6   | Peruna, kuorittu, suurtaloustuote, suojakaasupakattu | Peruna, kuorittu, suurtaloustuote, suojakaasupakattu | Potato, peeled, vacuum packed, catering   | Potato, peeled, vacuum packed, catering   |
| 7   | Lohkoperuna [D]                                      | Peruna, kuorittu, keitetty, suolaton [D]             | Potato cutlet [D]                         | Potato, peeled, boiled without salt [D]   |
| 8   | Röstiperuna [D]                                      | Peruna, kuorittu, keitetty, suolaa [D]               | Potato cauliflower curry [D]              | Potato, peeled, boiled with salt [D]      |

## Inflected and base forms

### `nauta`

| #   | Before, Finnish names                                    | After, Finnish names                    | Before, English names              | After, English names      |
| --- | -------------------------------------------------------- | --------------------------------------- | ---------------------------------- | ------------------------- |
| 1   | Jauheliha, sika-nauta                                    | Naudanpaisti                            | Pork beef mince                    | Beef round                |
| 2   | Lihasäilyke, sika-nauta                                  | Naudanlapa/etuselkä, naudan keittoliha  | Pork and beef, canned              | Beef, average             |
| 3   | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 7 %  | Naudanliha, rasvainen, keskiarvo        | Pork and beef steak mince, 7% fat  | Beef chuck, beef shoulder |
| 4   | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 % | Naudanfilee, ulkofilee                  | Pork and beef steak mince, 10% fat | Beef sirloin              |
| 5   | Lasagne, sika-nauta [D]                                  | Naudanfilee, sisäfilee                  | Pork beef mince soup [D]           | Beef tenderloin           |
| 6   | Italianpata, sika-nauta [D]                              | Naudanruho, keskirasvainen, 13 % rasvaa | Pork beef mince gravy [D]          | Beef, medium fat, 13% fat |
| 7   | Kaalikääryle, sika-nauta [D]                             | Naudanpotka                             | Cabbage soup with beef [D]         | Beef brisket              |
| 8   | Jauhelihakeitto, sika-nauta [D]                          | Naudanrinta                             | Low-fat pork beef mince soup [D]   | Beef knuckle              |

### `naudan`

| #   | Before, Finnish names                           | After, Finnish names                                     | Before, English names         | After, English names               |
| --- | ----------------------------------------------- | -------------------------------------------------------- | ----------------------------- | ---------------------------------- |
| 1   | Naudan/vasikankyljys, leivitetty, paistettu [D] | Jauheliha, sika-nauta                                    | Beef chop, breaded, fried [D] | Pork beef mince                    |
| 2   | Naudankylki                                     | Jauheliha, naudan, rasvaa 17 %                           | Beef flank                    | Beef mince, 17% fat                |
| 3   | Naudanpotka                                     | Naudanlapa/etuselkä, naudan keittoliha                   | Beef round                    | Beef chuck, beef shoulder          |
| 4   | Naudanrinta                                     | Jauheliha, naudan, vähärasvainen, rasvaa 7 %             | Beef brisket                  | Lean steak mince, 7% fat           |
| 5   | Naudanpaisti                                    | Maksa, naudan                                            | Beef knuckle                  | Liver, beef                        |
| 6   | Naudanfilee, sisäfilee                          | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 % | Beef sirloin                  | Pork and beef steak mince, 10% fat |
| 7   | Naudanfilee, ulkofilee                          | Kieli, naudan                                            | Beef tenderloin               | Heart, beef                        |
| 8   | Naudanlapa/etuselkä, naudan keittoliha          | Sydän, naudan                                            | Beef, average                 | Tongue, beef                       |

### `kanan`

| #   | Before, Finnish names                              | After, Finnish names                                                      | Before, English names         | After, English names                                                               |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| 1   | Kananmuna, kuoreton                                | Kana                                                                      | Egg without shell             | Chicken                                                                            |
| 2   | Kananmuna, kuorineen punnittu                      | Kana, keitetty, suolaa [D]                                                | Egg yolk, 34% of egg mass     | Chicken, boiled with salt [D]                                                      |
| 3   | Kananmunan keltuainen, 34 % kananmunan massasta    | Kana, keitetty, suolaton [D]                                              | Egg white, 66% of egg mass    | Chicken, boiled without salt [D]                                                   |
| 4   | Kananmunan valkuainen, 66 % kananmunan massasta    | Ateriankorvike, keittojauhe, parsa/kala/kana/sieni, easy diet             | Egg powder, for food industry | Meal replacement, soup powder, asparagus/fish/chicken/mushroom, easy diet          |
| 5   | Kananmunajauhe, elintarviketeollisuuden raaka-aine | Ateriankorvike, keittojauhe ja vesi, parsa/kala/kana/sieni, easy diet [D] | Egg, whole, with shell        | Meal replacement, soup from powder, asparagus/fish/chicken/mushroom, easy diet [D] |
| 6   | Kananmuna, kuoreton, luomu                         | Kananmuna, kuoreton                                                       | Egg, omega, without shell     | Egg without shell                                                                  |
| 7   | Kananmuna, omega, kuoreton                         | Kananmunan keltuainen, 34 % kananmunan massasta                           | Egg, without shell, organic   | Egg yolk, 34% of egg mass                                                          |
| 8   | Kananmuna, keitetty [D]                            | Kananmunan valkuainen, 66 % kananmunan massasta                           | Egg, fried [D]                | Egg white, 66% of egg mass                                                         |

### `sika`

| #   | Before, Finnish names                                    | After, Finnish names                | Before, English names                 | After, English names          |
| --- | -------------------------------------------------------- | ----------------------------------- | ------------------------------------- | ----------------------------- |
| 1   | Jauheliha, sika-nauta                                    | Sian selkäsilava                    | Pork beef mince                       | Fatback                       |
| 2   | Lihasäilyke, sika-nauta                                  | Sian lämminsavukylki, rasvainen [D] | Pork and beef, canned                 | Pork flank, smoked, fatty [D] |
| 3   | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 7 %  | Sianliha, keskiarvo                 | Pork and beef steak mince, 7% fat     | Pork, average                 |
| 4   | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 % | Siankylki                           | Pork and beef steak mince, 10% fat    | Pork ribs                     |
| 5   | Lasagne, sika-nauta [D]                                  | Sianlapa                            | Pork beef mince soup [D]              | Pork shoulder                 |
| 6   | Italianpata, sika-nauta [D]                              | Sianpaisti, vähärasvainen           | Pork beef mince gravy [D]             | Pork roast, lean              |
| 7   | Kaalikääryle, sika-nauta [D]                             | Siankyljys/selkä, paksu rasvakerros | Low-fat pork beef mince soup [D]      | Pork chop, thick layer of fat |
| 8   | Jauhelihakeitto, sika-nauta [D]                          | Siankyljys                          | Italian stew with pork beef mince [D] | Ham, fatty                    |

### `sian`

| #   | Before, Finnish names                | After, Finnish names                                     | Before, English names                   | After, English names               |
| --- | ------------------------------------ | -------------------------------------------------------- | --------------------------------------- | ---------------------------------- |
| 1   | Sian selkäsilava                     | Sian selkäsilava                                         | Fatback                                 | Fatback                            |
| 2   | Sian lämminsavukylki, rasvainen [D]  | Sian lämminsavukylki, rasvainen [D]                      | Pork flank, smoked, fatty [D]           | Pork flank, smoked, fatty [D]      |
| 3   | Kalakeitto, lohiseljanka [D]         | Jauheliha, sika-nauta                                    | Russian fish soup, solyanka [D]         | Pork beef mince                    |
| 4   | Kalakeitto, venäläinen, seljanka [D] | Jauheliha, sian, rasvaa 16 %                             | Russian fish soup, solyanka, salmon [D] | Pork mince, fat 16 %               |
| 5   | Sianlapa                             | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 % | Pork ribs                               | Pork and beef steak mince, 10% fat |
| 6   | Siankylki                            | Maksa, sian                                              | Pork shoulder                           | Liver, pork                        |
| 7   | Sianpotka                            | Sianliha, 0-lajitelma, sian kastikeliha, raaka           | Ham, fatty                              | Pork, assortment 0, pork for sauce |
| 8   | Siankyljys                           | Lihasäilyke, sika-nauta                                  | Pork, average                           | Pork and beef, canned              |

### `lammas`

| #   | Before, Finnish names                               | After, Finnish names                               | Before, English names     | After, English names                   |
| --- | --------------------------------------------------- | -------------------------------------------------- | ------------------------- | -------------------------------------- |
| 1   | Lammaspaisti [D]                                    | Lampaanliha, vähärasvainen                         | Mutton roast [D]          | Lamb, low-fat                          |
| 2   | Lihapata, lammaskaali, lammas, kaali, lihaliemi [D] | Lampaanliha, rasvainen                             | Lamb and cabbage stew [D] | Lamb                                   |
| 3   | Lihapata, lammascurry [D]                           | Lampaanpaisti                                      | Lamb curry [D]            | Lamb roast                             |
| 4   |                                                     | Lampaanliha, vähärasvainen, keitetty [D]           |                           | Lamb, low-fat, boiled [D]              |
| 5   |                                                     | Lampaanliha, vähärasvainen, keitetty, suolaton [D] |                           | Lamb, low-fat, boiled without salt [D] |
| 6   |                                                     | Jauheliha, lampaan, rasvaa 14 %                    |                           | Lamb mince, 14% fat                    |
| 7   |                                                     | Jauheliha, lampaan, paistettu ilman rasvaa [D]     |                           | Lamb mince, fried without fat [D]      |
| 8   |                                                     | Lampaanpihvi, paistettu [D]                        |                           | Lamb steak, fried [D]                  |

### `lampaan`

| #   | Before, Finnish names                           | After, Finnish names                               | Before, English names                  | After, English names                   |
| --- | ----------------------------------------------- | -------------------------------------------------- | -------------------------------------- | -------------------------------------- |
| 1   | Lampaanpaisti                                   | Jauheliha, lampaan, rasvaa 14 %                    | Lamb                                   | Lamb mince, 14% fat                    |
| 2   | Lampaanliha, rasvainen                          | Jauheliha, lampaan, paistettu ilman rasvaa [D]     | Lamb roast                             | Lamb mince, fried without fat [D]      |
| 3   | Lampaanliha, vähärasvainen                      | Lampaanliha, vähärasvainen                         | Lamb, low-fat                          | Lamb, low-fat                          |
| 4   | Lampaanpihvi, paistettu [D]                     | Lampaanliha, rasvainen                             | Lamb steak, fried [D]                  | Lamb                                   |
| 5   | Lampaankyljys, leivitetty [D]                   | Lampaanpaisti                                      | Mutton chop, breaded [D]               | Lamb roast                             |
| 6   | Lampaan- ja sianliha, keitetty [D]              | Lammaspaisti [D]                                   | Mutton and pork, boiled mixture [D]    | Mutton roast [D]                       |
| 7   | Lampaanliha, vähärasvainen, keitetty [D]        | Lampaanliha, vähärasvainen, keitetty [D]           | Lamb, filled with leek and parsley [D] | Lamb, low-fat, boiled [D]              |
| 8   | Lampaanliharulla, täytetty, purjo, persilja [D] | Lampaanliha, vähärasvainen, keitetty, suolaton [D] | Lamb, low-fat, boiled [D]              | Lamb, low-fat, boiled without salt [D] |

### `perunan`

| #   | Before, Finnish names | After, Finnish names                                 | Before, English names | After, English names                    |
| --- | --------------------- | ---------------------------------------------------- | --------------------- | --------------------------------------- |
| 1   |                       | Peruna, vanha, kuorittu                              |                       | Potato, peeled                          |
| 2   |                       | Peruna, punnittu kuorineen                           |                       | Potato, unpeeled, avarage, raw          |
| 3   |                       | Peruna, uusi                                         |                       | Potato, new                             |
| 4   |                       | Peruna, kuivattu                                     |                       | Potato, dried                           |
| 5   |                       | Peruna, kuorittu, suurtaloustuote, suojakaasupakattu |                       | Potato, peeled, vacuum packed, catering |
| 6   |                       | Peruna, kuorittu, keitetty, suolaton [D]             |                       | Potato, peeled, boiled without salt [D] |
| 7   |                       | Peruna, kuorittu, keitetty, suolaa [D]               |                       | Potato, peeled, boiled with salt [D]    |
| 8   |                       | Peruna, kuorineen, keitetty, suolaa [D]              |                       | Potato, unpeeled, boiled with salt [D]  |

### `hirvi`

| #   | Before, Finnish names                                  | After, Finnish names                          | Before, English names                          | After, English names                   |
| --- | ------------------------------------------------------ | --------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| 1   | Lihapata, hirvipata, porkkana, sipuli, herkkusieni [D] | Hirvenliha                                    | Elk stew with carrot, onion and champignon [D] | Elk                                    |
| 2   |                                                        | Hirvenpaisti [D]                              |                                                | Roasted elk [D]                        |
| 3   |                                                        | Hirvenliha, paistettu [D]                     |                                                | Elk, fried [D]                         |
| 4   |                                                        | Hirvenlihakäristys [D]                        |                                                | Sauteed elk [D]                        |
| 5   |                                                        | Hirvenlihakäristys, siansilavaa [D]           |                                                | Sauteed elk, with pork fat [D]         |
| 6   |                                                        | Hirvenlihakastike, ruoanvalmistuskerma [D]    |                                                | Elk meat gravy, brown gravy [D]        |
| 7   |                                                        | Hirvenlihakeitto, peruna, porkkana [D]        |                                                | Elk meat gravy, with cooking cream [D] |
| 8   |                                                        | Hirvenlihakastike, ruskea kastike, rasvaa [D] |                                                | Meat soup, elk, potato, carrot [D]     |

## Two words

### `jauheliha nauta`

| #   | Before, Finnish names                                    | After, Finnish names                                       | Before, English names                  | After, English names                       |
| --- | -------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------- | ------------------------------------------ |
| 1   | Jauheliha, sika-nauta                                    | Jauheliha, sika-nauta                                      | Pork beef mince                        | Pork beef mince                            |
| 2   | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 7 %  | Jauheliha, naudanpaisti, rasvaa 9 %                        | Pork and beef steak mince, 7% fat      | Lean steak mince, 9% fat                   |
| 3   | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 % | Jauheliha, naudan, rasvaa 17 %                             | Pork and beef steak mince, 10% fat     | Beef mince, 17% fat                        |
| 4   | Jauheliha, sika-nauta, paistettu [D]                     | Jauheliha, naudan, vähärasvainen, rasvaa 7 %               | Pork beef mince, fried [D]             | Lean steak mince, 7% fat                   |
| 5   | Jauheliha, sika-nauta, paistettu ilman rasvaa [D]        | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 %   | Pork beef mince, fried without fat [D] | Pork and beef steak mince, 10% fat         |
| 6   | Jauheliha, kevyt, sika-nauta, paistettu [D]              | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 7 %    | Pork beef mince, 10% fat, fried [D]    | Pork and beef steak mince, 7% fat          |
| 7   | Jauhelihakeitto, sika-nauta [D]                          | Jauheliha, naudanpaisti, paistettu ilman rasvaa [D]        | Pork beef mince soup [D]               | Lean beef mince, fried without fat [D]     |
| 8   | Jauheliha-kasvispata, sika-nauta [D]                     | Jauheliha, naudan, rasvaa 17 %, paistettu ilman rasvaa [D] | Pork beef mince gravy [D]              | Beef mince, 17% fat, fried without fat [D] |

### `naudan jauheliha`

| #   | Before, Finnish names                                                | After, Finnish names                                         | Before, English names                               | After, English names                       |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------ |
| 1   | Jauheliha, naudan, rasvaa 17 %                                       | Jauheliha, sika-nauta                                        | Beef mince, 17% fat                                 | Pork beef mince                            |
| 2   | Jauheliha, naudan, vähärasvainen, rasvaa 7 %                         | Jauheliha, naudan, rasvaa 17 %                               | Lean steak mince, 7% fat                            | Beef mince, 17% fat                        |
| 3   | Vorschmack, lampaan ja naudan jauheliha [D]                          | Jauheliha, naudan, vähärasvainen, rasvaa 7 %                 | Macaroni stew with beef mince [D]                   | Lean steak mince, 7% fat                   |
| 4   | Jauheliha-makaronimuhennos, naudan jauheliha 17% [D]                 | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 10 %     | Lean beef mince, fried without fat [D]              | Pork and beef steak mince, 10% fat         |
| 5   | Jauheliha, naudan, rasvaa 17 %, paistettu ilman rasvaa [D]           | Jauheliha, sika-nauta, kevyt, vähärasvainen, rasvaa 7 %      | Vorschmack, lamb mince, beef mince [D]              | Pork and beef steak mince, 7% fat          |
| 6   | Jauheliha, naudan, vähärasvainen, paistettu ilman rasvaa [D]         | Jauheliha, naudan, rasvaa 17 %, paistettu ilman rasvaa [D]   | Beef mince, 17% fat, fried without fat [D]          | Lean beef mince, fried without fat [D]     |
| 7   | Jauheliha, naudan, rasvaa 17 %, paistettu ilman rasvaa, suolaton [D] | Jauheliha, naudan, vähärasvainen, paistettu ilman rasvaa [D] | Beef mince, 17% fat, fried without fat and salt [D] | Beef mince, 17% fat, fried without fat [D] |
| 8   | Jauheliha, naudanpaisti, rasvaa 9 %                                  | Jauheliha, sika-nauta, paistettu ilman rasvaa [D]            | Lean steak mince, 9% fat                            | Pork beef mince, fried without fat [D]     |

### `rahka vl`

| #   | Before, Finnish names                                                    | After, Finnish names                                                     | Before, English names                                                  | After, English names                                                   |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | Rahka, maustettu, rasvaa 7 %, vl                                         | Rahka, maitorahka, maustamaton, rasvaa <0,5 %, vl                        | Quark, 2,3% fat, low-lactose                                           | Quark, <0.5% fat, low-lactose                                          |
| 2   | Rahka, maustettu, rasvaton, proteiinirahka, vl                           | Rahka, maustettu, rasvaa 7 %, vl                                         | Quark, <0.5% fat, low-lactose                                          | Quark, 2,3% fat, low-lactose                                           |
| 3   | Rahka, maitorahka, maustamaton, rasvaa 2,3 %, vl                         | Rahka, maustettu, rasvaton, proteiinirahka, vl                           | Quark, flavoured, 7% fat, low-lactose                                  | Quark, flavoured, 7% fat, low-lactose                                  |
| 4   | Rahka, maitorahka, maustamaton, rasvaa <0,5 %, vl                        | Rahka, maitorahka, maustamaton, rasvaa 2,3 %, vl                         | Quark, flavoured, fat-free, protein quark, low-lactose                 | Quark, flavoured, fat-free, protein quark, low-lactose                 |
| 5   | Rasvaseos 40%, valio better rahkariini, vl                               | Rasvaseos 40%, valio better rahkariini, vl                               | Blend 40%, oivariini light, low-lactose                                | Blend 40%, oivariini light, low-lactose                                |
| 6   | Jogurtti, maustettu, rahkainen jogurtti, valio, rasvaa 1,7 %, vl         | Jogurtti, maustettu, rahkainen jogurtti, valio, rasvaa 1,7 %, vl         | Yoghurt with quark, flavoured, valio, 1.7% fat, low-lactose            | Yoghurt with quark, flavoured, valio, 1.7% fat, low-lactose            |
| 7   | Jogurtti, juotava, valiojogurtti rahkainen, rasvaa 1,2 %, vl, d-vit 1 ug | Jogurtti, juotava, valiojogurtti rahkainen, rasvaa 1,2 %, vl, d-vit 1 ug | Yoghurt, drinkable, valio yoghurt with quark, 1.2% fat, 1 ug vitamin d | Yoghurt, drinkable, valio yoghurt with quark, 1.2% fat, 1 ug vitamin d |

### `maito rasvaton`

| #   | Before, Finnish names                                                          | After, Finnish names                                                           | Before, English names                                                           | After, English names                                                            |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Maito, rasvaton, d-vitamiinia 1 ug                                             | Maito, rasvaton, d-vitamiinia 1 ug                                             | Milk, 0% fat, i ug added vitamin d                                              | Milk, 0% fat, i ug added vitamin d                                              |
| 2   | Maito, rasvaton, vl, d-vitamiinia 1 ug                                         | Maito, rasvaton, ei lisätty d-vitamiinia, luomu                                | Milk, 0% fat, with added calcium and 0.5 ug vitamin d                           | Milk, 0% fat, without added vitamin d, organic                                  |
| 3   | Maito, rasvaton, valio plus, d-vitamiinia 2 ug                                 | Maito, rasvaton, vl, d-vitamiinia 1 ug                                         | Milk, 0% fat, valio plus, 2 ug added vitamin d                                  | Milk, 0% fat, with added calcium and 0.5 ug vitamin d                           |
| 4   | Maito, rasvaton, ei lisätty d-vitamiinia, luomu                                | Maito, rasvaton, valio plus, d-vitamiinia 2 ug                                 | Milk, 0% fat, without added vitamin d, organic                                  | Milk, 0% fat, valio plus, 2 ug added vitamin d                                  |
| 5   | Maito, rasvaton, lisätty kalsiumia, d-vitamiinia 0,5 ug                        | Maito, rasvaton, lisätty kalsiumia, d-vitamiinia 0,5 ug                        | Milk, 0% fat, low-lactose, 1 ug added vitamin d                                 | Milk, 0% fat, low-lactose, 1 ug added vitamin d                                 |
| 6   | Maito, rasvaton, laktoositon maitojuoma, d-vitamiinia 1 ug                     | Maito, rasvaton, laktoositon maitojuoma, d-vitamiinia 1 ug                     | Milk, 0% fat, lactose-free, 1 ug added vitamin d                                | Milk, 0% fat, lactose-free, 1 ug added vitamin d                                |
| 7   | Maito, rasvaton, laktoositon maitojuoma, valio eila, d-vitamiinia 2 ug         | Maito, rasvaton, laktoositon maitojuoma, valio eila, d-vitamiinia 2 ug         | Milk, 0% fat, lactose-free, valio eila, 2 ug added vitamin d                    | Milk, 0% fat, lactose-free, valio eila, 2 ug added vitamin d                    |
| 8   | Maito, rasvaton, valio profeel voimamaitojuoma, d-vitamiinia 1 ug, laktoositon | Maito, rasvaton, valio profeel voimamaitojuoma, d-vitamiinia 1 ug, laktoositon | Milk, 0% fat, valio profeel voimamaitojuoma, 1 ug added vitamin d, lactose-free | Milk, 0% fat, valio profeel voimamaitojuoma, 1 ug added vitamin d, lactose-free |

### `kana riisi`

| #   | Before, Finnish names                                                              | After, Finnish names                                                               | Before, English names                                                       | After, English names                                                        |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Porkkana-riisipiirakka, sekakuori, teollinen [D]                                   | Porkkana-riisipiirakka, sekakuori, teollinen [D]                                   | Carrot rice pasty, whole milk [D]                                           | Carrot rice pasty, whole milk [D]                                           |
| 2   | Porkkana-riisipiirakka, voitaikina, täysmaito [D]                                  | Porkkana-riisipiirakka, voitaikina, täysmaito [D]                                  | Carrot rice pasty, low-fat milk [D]                                         | Carrot rice pasty, low-fat milk [D]                                         |
| 3   | Porkkana-riisipiirakka, voitaikina, kevytmaito [D]                                 | Porkkana-riisipiirakka, voitaikina, kevytmaito [D]                                 | Carrot rice pasty, fat-free milk [D]                                        | Carrot rice pasty, fat-free milk [D]                                        |
| 4   | Porkkana-riisipiirakka, voitaikina, rasvaton maito [D]                             | Porkkana-riisipiirakka, voitaikina, rasvaton maito [D]                             | Karelian pasty filled with carrot and rice, industrial [D]                  | Karelian pasty filled with carrot and rice, industrial [D]                  |
| 5   | Teriyaki-kanaa riisillä chilikastikkeessa, kitchen joy thai-cube, valmisateria [D] | Teriyaki-kanaa riisillä chilikastikkeessa, kitchen joy thai-cube, valmisateria [D] | Chicken salad with rice peas, pickles, leek [D]                             | Chicken salad with rice peas, pickles, leek [D]                             |
| 6   | Ohukainen, soijajuoma, riisijauho, gluteeniton, maidoton, kananmunaton [D]         | Ohukainen, soijajuoma, riisijauho, gluteeniton, maidoton, kananmunaton [D]         | Sweet chili chicken teriyaki with jasmine rice, kitchen joy, ready meal [D] | Sweet chili chicken teriyaki with jasmine rice, kitchen joy, ready meal [D] |
| 7   | Ateriasalaatti, kanasalaatti, riisi, herne, maustekurkku, purjo, ei kastiketta [D] | Ateriasalaatti, kanasalaatti, riisi, herne, maustekurkku, purjo, ei kastiketta [D] | Thin pancake, soya drink, rice flour, gluten-free, dairy-free, egg-free [D] | Thin pancake, soya drink, rice flour, gluten-free, dairy-free, egg-free [D] |

### `kevytmaito laktoositon`

| #   | Before, Finnish names                                                     | After, Finnish names                                                      | Before, English names                                          | After, English names                                           |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Maito, kevytmaito, laktoositon maitojuoma, d-vitamiinia 1 ug              | Maito, kevytmaito, laktoositon maitojuoma, d-vitamiinia 1 ug              | Milk, 1.5% fat, lactose-free, 1 ug added vitamin d             | Milk, 1.5% fat, lactose-free, 1 ug added vitamin d             |
| 2   | Maito, kevytmaito, laktoositon maitojuoma, valio eila, d-vitamiinia 2 ug  | Maito, kevytmaito, laktoositon maitojuoma, valio eila, d-vitamiinia 2 ug  | Milk, 1.5% fat, lactose-free, valio eila, 2 ug added vitamin d | Milk, 1.5% fat, lactose-free, valio eila, 2 ug added vitamin d |
| 3   | Maito, kevytmaito, laktoositon maitojuoma, ei lisätty d-vitamiinia, luomu | Maito, kevytmaito, laktoositon maitojuoma, ei lisätty d-vitamiinia, luomu | Milk, 1.5% fat, lactose-free, without added vitamin d, organic | Milk, 1.5% fat, lactose-free, without added vitamin d, organic |
| 4   | Perunasose, kevytmaito, laktoositon [D]                                   | Perunasose, kevytmaito, laktoositon [D]                                   | Bun, low-fat milk, lactose-free [D]                            | Bun, low-fat milk, lactose-free [D]                            |
| 5   | Pulla, keskirasvainen, kevytmaito, laktoositon [D]                        | Pulla, keskirasvainen, kevytmaito, laktoositon [D]                        | Mashed potatoes, low-fat milk, lactose-free [D]                | Mashed potatoes, low-fat milk, lactose-free [D]                |

## Everyday log sheet searches, Finnish

### `leipä`

| #   | Before, Finnish names           | After, Finnish names                            | Before, English names          | After, English names                               |
| --- | ------------------------------- | ----------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| 1   | Ruisleipä, ruista 51% [D]       | Sekaleipä, nyrkkirieska, ohra, kotitekoinen [D] | Toast, rye toast [D]           | Multigrain bread, flatbread, barley, home-made [D] |
| 2   | Paahtoleipä, monivilja [D]      | Ruisleipä, ruista 51% [D]                       | Rye bread, 51% rye [D]         | Toast, rye toast [D]                               |
| 3   | Ruisleipä, varrasleipä [D]      | Paahtoleipä, monivilja [D]                      | Toast, wheat toast [D]         | Rye bread, 51% rye [D]                             |
| 4   | Sekaleipä, ruissämpylä [D]      | Ruisleipä, varrasleipä [D]                      | Toast, graham toast [D]        | Toast, wheat toast [D]                             |
| 5   | Tippaleipä, kevytmaito [D]      | Sekaleipä, ruissämpylä [D]                      | Pita kebab, kebab roll [D]     | Toast, graham toast [D]                            |
| 6   | Ruisleipä, ruissekaleipä [D]    | Tippaleipä, kevytmaito [D]                      | Toast, multigrain toast [D]    | Pita kebab, kebab roll [D]                         |
| 7   | Tippaleipä, rasvaton maito [D]  | Ruisleipä, ruissekaleipä [D]                    | Multigrain bread, rye roll [D] | Toast, multigrain toast [D]                        |
| 8   | Voileipä, lämmin sienileipä [D] | Tippaleipä, rasvaton maito [D]                  | Rye bread, dried rye bread [D] | Multigrain bread, rye roll [D]                     |

### `ruisleipä`

| #   | Before, Finnish names                            | After, Finnish names                             | Before, English names                        | After, English names                         |
| --- | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| 1   | Ruisleipä, ruista 51% [D]                        | Ruisleipä, ruista 51% [D]                        | Rye bread, 51% rye [D]                       | Rye bread, 51% rye [D]                       |
| 2   | Ruisleipä, varrasleipä [D]                       | Ruisleipä, varrasleipä [D]                       | Rye bread, dried rye bread [D]               | Rye bread, dried rye bread [D]               |
| 3   | Ruisleipä, ruissekaleipä [D]                     | Ruisleipä, ruissekaleipä [D]                     | Rye bread, rye mixed grain bread [D]         | Rye bread, rye mixed grain bread [D]         |
| 4   | Ruisleipä, tumma täysjyväleipä vähäsuolainen [D] | Ruisleipä, tumma täysjyväleipä vähäsuolainen [D] | Rye bread, sweet and sour rye malt bread [D] | Rye bread, sweet and sour rye malt bread [D] |
| 5   | Ruisleipä, ruispalat, vaasan [D]                 | Ruisleipä, ruispalat, vaasan [D]                 | Rye bread, puikula, fazer [D]                | Rye bread, puikula, fazer [D]                |
| 6   | Ruisleipä, puikula ruis, fazer [D]               | Ruisleipä, puikula ruis, fazer [D]               | Rye bread, ruispalat, vaasan [D]             | Rye bread, ruispalat, vaasan [D]             |
| 7   | Ruisleipä, tosi rukiinen, vaasan [D]             | Ruisleipä, tosi rukiinen, vaasan [D]             | Rye bread, tosi rukiinen, vaasan [D]         | Rye bread, tosi rukiinen, vaasan [D]         |
| 8   | Ruisleipä, oululainen ruislimppu, fazer [D]      | Ruisleipä, oululainen ruislimppu, fazer [D]      | Rye bread, oululainen reilu, fazer [D]       | Rye bread, oululainen reilu, fazer [D]       |

### `kahvi`

| #   | Before, Finnish names                         | After, Finnish names                          | Before, English names               | After, English names                |
| --- | --------------------------------------------- | --------------------------------------------- | ----------------------------------- | ----------------------------------- |
| 1   | Kahvi, pannukahvijuoma                        | Kahvi, kahvijuoma, keskiarvo                  | Boiled coffee drink                 | Coffee, average                     |
| 2   | Kahvi, suodatinkahvijuoma                     | Kahvi, suodatinkahvijuoma                     | Filtered coffee drink               | Filtered coffee drink               |
| 3   | Kahvi, kahvijuoma, keskiarvo                  | Kahvi, pannukahvijuoma                        | Coffee, average                     | Boiled coffee drink                 |
| 4   | Kahvi, murukahvi, pikakahvi, valmistamaton    | Kahvi, murukahvi, pikakahvi, valmistamaton    | Instant coffee, powder              | Instant coffee, powder              |
| 5   | Kahvi, cappuccino, makeuttamaton, täysmaito   | Kahvi, cappuccino, makeuttamaton, täysmaito   | Coffee, instant, drink              | Coffee, instant, drink              |
| 6   | Kahvi, caffe latte, makeuttamaton, täysmaito  | Kahvi, caffe latte, makeuttamaton, täysmaito  | Cafe latte, unsweetened, soy drink  | Cafe latte, unsweetened, soy drink  |
| 7   | Kahvi, cappuccino, makeuttamaton, kevytmaito  | Kahvi, cappuccino, makeuttamaton, kevytmaito  | Cafe latte, unsweetened, whole milk | Cafe latte, unsweetened, whole milk |
| 8   | Kahvi, cafe au lait, makeuttamaton, täysmaito | Kahvi, cafe au lait, makeuttamaton, täysmaito | Cappuccino, unsweetened, whole milk | Cappuccino, unsweetened, whole milk |

### `jogurtti`

| #   | Before, Finnish names               | After, Finnish names                                       | Before, English names        | After, English names                                |
| --- | ----------------------------------- | ---------------------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| 1   | Jogurtti, maustettu, rasvaton       | Jogurtti, maustamaton, rasvaa 2,5 %, vl                    | Yoghurt with jam, fat-free   | Yoghurt, fat 6-8%, for food preparation             |
| 2   | Jogurtti, juotava, rasvaa 0,1 %     | Jogurtti, ruoanvalmistusjogurtti, rasvaa 6-8 %, vl         | Yoghurt, plain, 1.5% fat     | Yoghurt, plain, 2.5% fat, low-lactose               |
| 3   | Jogurtti, maustamaton, rasvaton     | Jogurtti, turkkilainen/kreikkalainen, rasvaa 10 %          | Yoghurt, plain, 2.5% fat     | Yoghurt, turkish/greek, 10% fat                     |
| 4   | Jogurtti, maustettu, rasvaa 2 %     | Jogurtti, maustamaton, rasvaa 2,5 %                        | Yoghurt, plain, fat-free     | Yoghurt, plain, 2.5% fat                            |
| 5   | Jogurtti, maustettu, rasvaa 3 %     | Jogurtti, maustamaton, bulgarian, rasvaa 3,5 %, d-vit 1 ug | Yoghurt, flavoured, 2% fat   | Yoghurt, bulgarian, plain, 3.5% fat, 1 ug vitamin d |
| 6   | Jogurtti, maustettu, rasvaa 7 %     | Jogurtti, maustettu, rasvaton                              | Yoghurt, flavoured, 3% fat   | Yoghurt with jam, fat-free                          |
| 7   | Jogurtti, maustettu, rasvaa 2,5 %   | Jogurtti, juotava, rasvaa 0,1 %                            | Yoghurt, flavoured, 7% fat   | Yoghurt, plain, 1.5% fat                            |
| 8   | Jogurtti, maustamaton, rasvaa 1,5 % | Jogurtti, maustamaton, rasvaton                            | Yoghurt, flavoured, 2.5% fat | Yoghurt, plain, fat-free                            |

### `puuro`

| #   | Before, Finnish names          | After, Finnish names                | Before, English names                      | After, English names                          |
| --- | ------------------------------ | ----------------------------------- | ------------------------------------------ | --------------------------------------------- |
| 1   | Tuorepuuro, jogurtti [D]       | Kaurapuuro, vesi, suolaa [D]        | Raw porridge, yoghurt [D]                  | Maize porridge, polenta [D]                   |
| 2   | Kaurapuuro, vesi, suolaa [D]   | Grahampuuro, vesi, suolaa [D]       | Maize porridge, polenta [D]                | Rice porridge, water, salt [D]                |
| 3   | Grahampuuro, vesi, suolaa [D]  | Hirssipuuro, vesi, suolaa [D]       | Semolina lingonberry porridge, whipped [D] | Graham porridge, water, salt [D]              |
| 4   | Hirssipuuro, vesi, suolaa [D]  | Kaurapuuro, vesi, suolaton [D]      | Rice porridge, milk, salt [D]              | Millet porridge, water, salt [D]              |
| 5   | Mannapuuro, maito, suolaa [D]  | Tattaripuuro, vesi, suolaa [D]      | Rice porridge, water, salt [D]             | Buckwheat porridge, water, salt [D]           |
| 6   | Hirssipuuro, maito, suolaa [D] | Talkkunapuuro, vesi, suolaa [D]     | Millet porridge, milk, salt [D]            | Mixed flake porridge, water, salt [D]         |
| 7   | Kaurapuuro, vesi, suolaton [D] | Maissipuuro, polenta, suolaa [D]    | Graham porridge, water, salt [D]           | Rice porridge, water, without salt [D]        |
| 8   | Tattaripuuro, vesi, suolaa [D] | Neljänviljanpuuro, vesi, suolaa [D] | Millet porridge, water, salt [D]           | Mixed flake porridge, water, without salt [D] |

### `kaurapuuro`

| #   | Before, Finnish names                    | After, Finnish names                     | Before, English names                                     | After, English names                                      |
| --- | ---------------------------------------- | ---------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Kaurapuuro, vesi, suolaa [D]             | Kaurapuuro, vesi, suolaa [D]             | Oat porridge, oat flakes, water, salt [D]                 | Oat porridge, oat flakes, water, salt [D]                 |
| 2   | Kaurapuuro, vesi, suolaton [D]           | Kaurapuuro, vesi, suolaton [D]           | Oat porridge, oat flakes, low-fat milk, salt [D]          | Oat porridge, oat flakes, water, without salt [D]         |
| 3   | Kaurapuuro, kevytmaito, suolaa [D]       | Kaurapuuro, kevytmaito, suolaa [D]       | Oat porridge, oat flakes, fat-free milk, salt [D]         | Oat porridge, oat flakes, low-fat milk, salt [D]          |
| 4   | Kaurapuuro, kevytmaito, suolaton [D]     | Kaurapuuro, kevytmaito, suolaton [D]     | Oat porridge, oat flakes, water, without salt [D]         | Oat porridge, oat flakes, fat-free milk, salt [D]         |
| 5   | Kaurapuuro, omena-kaneli, elovena [D]    | Kaurapuuro, omena-kaneli, elovena [D]    | Oat porridge, oat flakes, fruit and berries, elovena [D]  | Oat porridge, oat flakes, fruit and berries, elovena [D]  |
| 6   | Kaurapuuro, marja-hedelmä, elovena [D]   | Kaurapuuro, marja-hedelmä, elovena [D]   | Oat porridge, oat flakes, low-fat milk, without salt [D]  | Oat porridge, oat flakes, low-fat milk, without salt [D]  |
| 7   | Kaurapuuro, rasvaton maito, suolaa [D]   | Kaurapuuro, rasvaton maito, suolaa [D]   | Oat porridge, oat flakes, apple and cinnamon, elovena [D] | Oat porridge, oat flakes, apple and cinnamon, elovena [D] |
| 8   | Kaurapuuro, rasvaton maito, suolaton [D] | Kaurapuuro, rasvaton maito, suolaton [D] | Oat porridge, oat flakes, fat-free milk, without salt [D] | Oat porridge, oat flakes, fat-free milk, without salt [D] |

### `keitto`

| #   | Before, Finnish names | After, Finnish names                            | Before, English names | After, English names                     |
| --- | --------------------- | ----------------------------------------------- | --------------------- | ---------------------------------------- |
| 1   | Kesäkeitto [D]        | Hernekeitto, säilyke, laimennettu, sianliha [D] | Onion soup [D]        | Pea soup, canned, diluted, with pork [D] |
| 2   | Porokeitto [D]        | Kesäkeitto [D]                                  | Lentil soup [D]       | Onion soup [D]                           |
| 3   | Nakkikeitto [D]       | Porokeitto [D]                                  | Tomato soup [D]       | Lentil soup [D]                          |
| 4   | Linssikeitto [D]      | Nakkikeitto [D]                                 | Chicken soup [D]      | Tomato soup [D]                          |
| 5   | Sipulikeitto [D]      | Linssikeitto [D]                                | Sausage soup [D]      | Chicken soup [D]                         |
| 6   | Makkarakeitto [D]     | Sipulikeitto [D]                                | Spinach soup [D]      | Sausage soup [D]                         |
| 7   | Broilerikeitto [D]    | Makkarakeitto [D]                               | Beetroot soup [D]     | Spinach soup [D]                         |
| 8   | Pinaattikeitto [D]    | Broilerikeitto [D]                              | Reindeer soup [D]     | Beetroot soup [D]                        |

### `pizza`

| #   | Before, Finnish names          | After, Finnish names           | Before, English names             | After, English names              |
| --- | ------------------------------ | ------------------------------ | --------------------------------- | --------------------------------- |
| 1   | Pizza, kinkkupizza [D]         | Pizza, kinkkupizza [D]         | Pizza, ham pizza [D]              | Pizza, ham pizza [D]              |
| 2   | Pizza, salamipizza [D]         | Pizza, salamipizza [D]         | Pizza, tuna pizza [D]             | Pizza, tuna pizza [D]             |
| 3   | Pizza, tonnikalapizza [D]      | Pizza, tonnikalapizza [D]      | Pizza, salami pizza [D]           | Pizza, salami pizza [D]           |
| 4   | Pizza, herkkusienipizza [D]    | Pizza, herkkusienipizza [D]    | Pizza, beef mince pizza [D]       | Pizza, beef mince pizza [D]       |
| 5   | Pizza, kana-ananaspizza [D]    | Pizza, kana-ananaspizza [D]    | Pizza, champignon pizza [D]       | Pizza, champignon pizza [D]       |
| 6   | Pizzapohja, hiivataikina [D]   | Pizzapohja, hiivataikina [D]   | Pizza, ham and tuna pizza [D]     | Pizza, ham and tuna pizza [D]     |
| 7   | Pizza, kinkku-ananaspizza [D]  | Pizza, kinkku-ananaspizza [D]  | Pizza, pork beef mince pizza [D]  | Pizza, pork beef mince pizza [D]  |
| 8   | Pizza, anjovis-oliivipizza [D] | Pizza, anjovis-oliivipizza [D] | Pizza, ham and mushroom pizza [D] | Pizza, ham and mushroom pizza [D] |

### `hampurilainen`

| #   | Before, Finnish names                              | After, Finnish names                               | Before, English names                         | After, English names                          |
| --- | -------------------------------------------------- | -------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| 1   | Hampurilainen, kalahampurilainen [D]               | Hampurilainen, kalahampurilainen [D]               | Fish burger [D]                               | Fish burger [D]                               |
| 2   | Hampurilainen, lohihampurilainen [D]               | Hampurilainen, lohihampurilainen [D]               | Salmon burger [D]                             | Salmon burger [D]                             |
| 3   | Hampurilainen, kerroshampurilainen [D]             | Hampurilainen, kerroshampurilainen [D]             | Double hamburger [D]                          | Double hamburger [D]                          |
| 4   | Hampurilainen, nyhtöpossu ja rouhesämpylä [D]      | Hampurilainen, nyhtöpossu ja rouhesämpylä [D]      | Hamburger with beef and rye bread [D]         | Hamburger with beef and rye bread [D]         |
| 5   | Hampurilainen, naudanlihapihvi ja rouhesämpylä [D] | Hampurilainen, naudanlihapihvi ja rouhesämpylä [D] | Hamburger with pork sirloin and rye bread [D] | Hamburger with pork sirloin and rye bread [D] |
| 6   | Hampurilainen, naudanlihapihvi ja vehnäsämpylä [D] | Hampurilainen, naudanlihapihvi ja vehnäsämpylä [D] | Hamburger, hk [D]                             | Hamburger, hk [D]                             |
| 7   | Hampurilainen, sika-nautapihvi ja vehnäsämpylä [D] | Hampurilainen, sika-nautapihvi ja vehnäsämpylä [D] | Hamburger, lidl [D]                           | Hamburger, lidl [D]                           |
| 8   | Hampurilainen, mcfeast, mcdonald's [D]             | Hampurilainen, mcfeast, mcdonald's [D]             | Hamburger, atria [D]                          | Hamburger, atria [D]                          |

### `pulla`

| #   | Before, Finnish names                           | After, Finnish names                            | Before, English names          | After, English names           |
| --- | ----------------------------------------------- | ----------------------------------------------- | ------------------------------ | ------------------------------ |
| 1   | Pulla, dallaspulla, fazer [D]                   | Pulla, dallaspulla, fazer [D]                   | Bun, water [D]                 | Bun, water [D]                 |
| 2   | Pulla, keskirasvainen, vesi [D]                 | Pulla, keskirasvainen, vesi [D]                 | Bun, low-fat milk [D]          | Bun, low-fat milk [D]          |
| 3   | Pulla, big texaspulla, fazer [D]                | Pulla, big texaspulla, fazer [D]                | Bun, water, oil [D]            | Bun, water, oil [D]            |
| 4   | Pulla, pirkka/x-tra, pakaste [D]                | Pulla, pirkka/x-tra, pakaste [D]                | Bun, water, butter [D]         | Bun, water, butter [D]         |
| 5   | Pulla, vähärasvainen, kevytmaito [D]            | Pulla, vähärasvainen, kevytmaito [D]            | Bun, low-fat milk, oil [D]     | Bun, low-fat milk, oil [D]     |
| 6   | Pulla, keskirasvainen, kevytmaito [D]           | Pulla, keskirasvainen, kevytmaito [D]           | Bun, low-fat milk, butter [D]  | Bun, low-fat milk, butter [D]  |
| 7   | Pulla, tiikerikranssi, vaasan isoäidin [D]      | Pulla, tiikerikranssi, vaasan isoäidin [D]      | Bun, pirkka/x-tra, frozen [D]  | Bun, pirkka/x-tra, frozen [D]  |
| 8   | Pulla, laskiaispulla, hillo ja mantelimassa [D] | Pulla, laskiaispulla, hillo ja mantelimassa [D] | Bun, low-fat, low-fat milk [D] | Bun, low-fat, low-fat milk [D] |

### `suklaa`

| #   | Before, Finnish names                                  | After, Finnish names                                   | Before, English names                    | After, English names                     |
| --- | ------------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------- | ---------------------------------------- |
| 1   | Suklaa, tumma                                          | Suklaa, tumma                                          | Chocolate, average                       | Chocolate, plain, dark chocolate         |
| 2   | Suklaa, keskiarvo                                      | Suklaa, keskiarvo                                      | Chocolate, milk chocolate                | Chocolate, average                       |
| 3   | Suklaa, maitosuklaa                                    | Suklaa, maitosuklaa                                    | Chocolate, white chocolate               | Chocolate, milk chocolate                |
| 4   | Suklaa, tumma, 80 %                                    | Suklaa, tumma, 80 %                                    | Chocolate, artificially sweetened        | Chocolate, plain, dark chocolate, 80%    |
| 5   | Suklaa, valkoinen, valkosuklaa                         | Suklaa, valkoinen, valkosuklaa                         | Chocolate, milk chocolate with hazelnuts | Chocolate, white chocolate               |
| 6   | Suklaa, sokeriton, keinotekoisesti makeutettu          | Suklaa, sokeriton, keinotekoisesti makeutettu          | Chocolate, plain, dark chocolate         | Chocolate, artificially sweetened        |
| 7   | Suklaa, pähkinäsuklaa, maitosuklaata ja hasselpähkinää | Suklaa, pähkinäsuklaa, maitosuklaata ja hasselpähkinää | Chocolate bar, caramel and cookie, twix  | Chocolate, milk chocolate with hazelnuts |
| 8   | Suklaa, suklaapatukka, twix, keksiä ja toffeeta        | Suklaa, suklaapatukka, twix, keksiä ja toffeeta        | Chocolate, plain, dark chocolate, 80%    | Chocolate bar, caramel and cookie, twix  |

### `makkara`

| #   | Before, Finnish names                 | After, Finnish names                   | Before, English names                         | After, English names              |
| --- | ------------------------------------- | -------------------------------------- | --------------------------------------------- | --------------------------------- |
| 1   | Makkara, verimakkara, mustamakkara    | Makkara, verimakkara, mustamakkara     | Blood sausage, black sausage                  | Blood sausage, black sausage      |
| 2   | Makkara, kasvismakkara, soijapitoinen | Makkara, kasvismakkara, soijapitoinen  | Vegetarian sausage, contains soya             | Vegetarian sausage, contains soya |
| 3   | Lenkkimakkara, keskiarvo              | Lenkkimakkara, keskiarvo               | Sausage bratwurst                             | Sausage, ring bologna, average    |
| 4   | Grillimakkara, bratwursti             | Grillimakkara, tuotekeskiarvo          | Barbeque sausage, cheese                      | Barbeque sausage, average         |
| 5   | Grillimakkara, juustoinen             | Grillimakkara, juustoinen              | Barbeque sausage, average                     | Barbeque sausage, cheese          |
| 6   | Lenkkimakkara, juustoinen             | Grillimakkara, kevyt, tuotekeskiarvo   | Groat sausage, average of industrial products | Barbeque sausage, light, average  |
| 7   | Raakamakkara, siskonmakkara           | Grillimakkara, lihaisa, tuotekeskiarvo | Sausage, ring bologna, average                | Barbeque sausage, meaty, average  |
| 8   | Ryynimakkara, tuotekeskiarvo          | Grillimakkara, bratwursti              | Barbeque sausage, light, 7% fat               | Sausage bratwurst                 |

### `kinkku`

| #   | Before, Finnish names               | After, Finnish names                                        | Before, English names           | After, English names             |
| --- | ----------------------------------- | ----------------------------------------------------------- | ------------------------------- | -------------------------------- |
| 1   | Siankinkku, silavoineen             | Siankinkku, silavoineen                                     | Ham, fatty                      | Ham, fatty                       |
| 2   | Siankinkku, rasvaton, uunissa [D]   | Siankinkku, rasvaton, uunissa [D]                           | Ham, lean, oven-baked [D]       | Ham, lean, oven-baked [D]        |
| 3   | Siankinkku, rasvoineen, uunissa [D] | Siankinkku, rasvoineen, uunissa [D]                         | Ham, fatty, oven-baked [D]      | Ham, fatty, oven-baked [D]       |
| 4   | Kinkkupasta [D]                     | Kokolihaleikkele, saunapalvikinkku, rasvaa 6 %              | Ham gravy [D]                   | Ham, smoked, 6% fat              |
| 5   | Kinkkukastike, ruokakerma [D]       | Kokolihaleikkele, keittokinkku, rasvaa 3 %                  | Ham pasta [D]                   | Ham, cooked ham, 3% fat          |
| 6   | Kinkkupiirakka, muropohja [D]       | Kokolihaleikkele, korppukinkku, rasvaa 3 %                  | Ham gravy with tomato [D]       | Crumbed ham, 3% fat              |
| 7   | Kinkkukastike, tomaattinen [D]      | Kokolihaleikkele, kinkkuleikkele, vähärasvainen, rasvaa 3 % | Ham gravy with whole milk [D]   | Ham, cooked ham, low-fat, 3% fat |
| 8   | Kinkkukastike, ruskea kastike [D]   | Leikkelemakkara, kinkkumakkara, rasvaa 16 %                 | Ham gravy with low-fat milk [D] | Ham, cooked, 2% fat              |

### `olut`

| #   | Before, Finnish names                                             | After, Finnish names                                              | Before, English names                     | After, English names                      |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| 1   | Olut, i-olut, <2,8 til% alkoholia                                 | Olut, keskiolut, 4,5 til% alkoholia                               | Beer, alcohol-free, 0.0% volume           | Beer, lager, medium strength, 4.5% volume |
| 2   | Olut, vahva, 7,5-8 til% alkoholia                                 | Olut, i-olut, <2,8 til% alkoholia                                 | Beer, strong ale, 7.5-8% volume           | Beer, alcohol-free, 0.0% volume           |
| 3   | Olut, a-olut, 5-5,5 til% alkoholia                                | Olut, vahva, 7,5-8 til% alkoholia                                 | Beer, lager, very mild <2.8% volume       | Beer, strong ale, 7.5-8% volume           |
| 4   | Olut, keskiolut, 4,5 til% alkoholia                               | Olut, a-olut, 5-5,5 til% alkoholia                                | Beer, lager, strong, 5-5.5% volume        | Beer, lager, very mild <2.8% volume       |
| 5   | Olut, alkoholiton olut, nikolai, 0,0 til% alkoholia, sinebrychoff | Olut, alkoholiton olut, nikolai, 0,0 til% alkoholia, sinebrychoff | Beer, lager, medium strength, 4.5% volume | Beer, lager, strong, 5-5.5% volume        |
| 6   | Kalja, kotiolut                                                   | Kalja, kotiolut                                                   | Beer home-made, alcohol-free              | Beer home-made, alcohol-free              |

### `jäätelö`

| #   | Before, Finnish names            | After, Finnish names                     | Before, English names     | After, English names                       |
| --- | -------------------------------- | ---------------------------------------- | ------------------------- | ------------------------------------------ |
| 1   | Jäätelö, rasvaton                | Jäätelö, kermajäätelö                    | Rice ice cream            | Ice cream, milk based                      |
| 2   | Jäätelö, snickers                | Jäätelö, maitojäätelö                    | Soft ice cream            | Ice cream, cream based                     |
| 3   | Jäätelö, kermajäätelö            | Jäätelö, pehmytjäätelö, ei vohvelia      | Soft ice cream with wafer | Soft ice cream                             |
| 4   | Jäätelö, maitojäätelö            | Jäätelö, soijajäätelö, tofuline, vanilja | Ice cream, fat-free       | Soy milk frozen dessert, tofuline, vanilla |
| 5   | Jäätelö, riisijäätelö            | Jäätelö, rasvaton                        | Ice cream, snickers       | Rice ice cream                             |
| 6   | Jäätelö, kasvirasvajäätelö       | Jäätelö, snickers                        | Ice cream, milk based     | Soft ice cream with wafer                  |
| 7   | Jäätelö, kermajäätelötuutti      | Jäätelö, riisijäätelö                    | Ice cream, cream based    | Ice cream, fat-free                        |
| 8   | Jäätelö, kasvirasvajäätelötuutti | Jäätelö, kasvirasvajäätelö               | Ice cream, vegetable fat  | Ice cream, snickers                        |

### `mysli`

| #   | Before, Finnish names           | After, Finnish names                                                        | Before, English names                | After, English names                           |
| --- | ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------- |
| 1   | Mysli, perus [D]                | Jogurtti, luonnonjogurtti ja marjamysli, a+, rasvaa 3,5 %, vl, d-vit 0,9 ug | Muesli with nuts [D]                 | Yoghurt with muesli, a+, fat 3.5%, low-lactose |
| 2   | Mysli, muromysli [D]            | Mysli, perus [D]                                                            | Muesli with dried fruit [D]          | Muesli with nuts [D]                           |
| 3   | Mysli, viljainen [D]            | Mysli, muromysli [D]                                                        | Muesli with dried fruit and nuts [D] | Muesli with dried fruit [D]                    |
| 4   | Mysli, hedelmäinen [D]          | Mysli, viljainen [D]                                                        | Muesli, basic [D]                    | Muesli with dried fruit and nuts [D]           |
| 5   | Mysli, pähkinäinen [D]          | Mysli, hedelmäinen [D]                                                      | Muesli, cereal [D]                   | Muesli, basic [D]                              |
| 6   | Mysli, härkäpapugranola [D]     | Mysli, pähkinäinen [D]                                                      | Muesli, crunchy [D]                  | Muesli, cereal [D]                             |
| 7   | Mysli, ei lisättyä sokeria [D]  | Mysli, härkäpapugranola [D]                                                 | Muesli, no added sugar [D]           | Muesli, crunchy [D]                            |
| 8   | Mysli, hedelmä-pähkinämysli [D] | Mysli, ei lisättyä sokeria [D]                                              | Muesli, kellogg's extra fruit [D]    | Muesli, no added sugar [D]                     |

### `keksi`

| #   | Before, Finnish names              | After, Finnish names               | Before, English names              | After, English names               |
| --- | ---------------------------------- | ---------------------------------- | ---------------------------------- | ---------------------------------- |
| 1   | Keksi, pikkuleipä [D]              | Riisikakku, riisikeksi             | Biscuit [D]                        | Rice cake                          |
| 2   | Keksi, suolakeksi [D]              | Keksi, pikkuleipä [D]              | Wafer biscuit [D]                  | Biscuit [D]                        |
| 3   | Keksi, marie-keksi [D]             | Keksi, suolakeksi [D]              | Digestive biscuit [D]              | Wafer biscuit [D]                  |
| 4   | Keksi, lusikkaleipä [D]            | Keksi, marie-keksi [D]             | Chocolate chip cookie [D]          | Digestive biscuit [D]              |
| 5   | Keksi, vohvelikeksi [D]            | Keksi, lusikkaleipä [D]            | Chocolate digestive biscuit [D]    | Chocolate chip cookie [D]          |
| 6   | Keksi, hanna-tädin pikkuleipä [D]  | Keksi, vohvelikeksi [D]            | Shortbread biscuit with egg [D]    | Chocolate digestive biscuit [D]    |
| 7   | Keksi, digestive välipalakeksi [D] | Keksi, hanna-tädin pikkuleipä [D]  | Biscuit covered with chocolate [D] | Shortbread biscuit with egg [D]    |
| 8   | Keksi, fruktoosilla makeutettu [D] | Keksi, digestive välipalakeksi [D] | Shortbread biscuit without egg [D] | Biscuit covered with chocolate [D] |

### `salaatti`

| #   | Before, Finnish names                                    | After, Finnish names                                     | Before, English names           | After, English names       |
| --- | -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------- | -------------------------- |
| 1   | Salaatti, kurpitsasalaatti, pikkelssi                    | Salaatti, kurkkusalaatti, kurkkupikkelssi, kurkkurelissi | Salad, pickled pumpkin          | Salad, sweet pickle relish |
| 2   | Salaatti, kurkkusalaatti, kurkkupikkelssi, kurkkurelissi | Salaatti, kurpitsasalaatti, pikkelssi                    | Salad, sweet pickle relish      | Salad, pickled pumpkin     |
| 3   | Salaatti, kaali-ananas [D]                               | Jäävuorisalaatti, rapea keräsalaatti, amerikansalaatti   | Salad, average mixture [D]      | Iceberg lettuce            |
| 4   | Salaatti, kaali-kurpitsa [D]                             | Lehtisalaatti, ruukkusalaatti, lollo rosso               | Salad, tomato and onion [D]     | Lettuce                    |
| 5   | Salaatti, kaali-puolukka [D]                             | Jääsalaatti                                              | Salad, beetroot and apple [D]   | Garden lettuce             |
| 6   | Salaatti, pasta-vihannes [D]                             | Punasalaatti, punasikuri                                 | Salad, cabbage and pumpkin [D]  | Radicchio                  |
| 7   | Salaatti, kaali-punajuuri [D]                            | Roomansalaatti, sidesalaatti                             | Salad, cabbage and beetroot [D] | Romaine lettuce            |
| 8   | Salaatti, punajuuri-omena [D]                            | Salaatti, kaali-ananas [D]                               | Salad, pasta and vegetables [D] | Salad, average mixture [D] |

### `smoothie`

| #   | Before, Finnish names                                        | After, Finnish names                                                          | Before, English names                                              | After, English names                                                         |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1   | Smoothie, marja/hedelmäjuoma [D]                             | Ateriankorvike, smoothie, juomajauhe, allevo                                  | Smoothie, fruit/berry [D]                                          | Meal replacement, smoothie, drink powder, allevo                             |
| 2   | Smoothie, mustikka-kookosmaito [D]                           | Ateriankorvike, smoothie, juomajauhe, easy diet                               | Smoothie, blueberry and coconut milk [D]                           | Meal replacement, smoothie, drink powder, average                            |
| 3   | Smoothie, mango-ananas-kookosmaito [D]                       | Ateriankorvike, smoothie, juomajauhe, nutrifast                               | Smoothie, fruit/berry, quark and milk [D]                          | Meal replacement, smoothie, drink powder, easy diet                          |
| 4   | Smoothie, porkkana-appelsiini-mansikkasmoothie [D]           | Ateriankorvike, smoothie, juomajauhe, tuotekeskiarvo                          | Smoothie, fruit/berry, yoghurt and milk [D]                        | Meal replacement, smoothie, drink powder, nutrifast                          |
| 5   | Smoothie, marja/hedelmä-rahkajuoma, rahka ja maito [D]       | Ateriankorvike, smoothie, valmisjuoma, naturdiet                              | Smoothie, mango, pineapple and coconut milk [D]                    | Meal replacement, smoothie, naturdiet                                        |
| 6   | Smoothie, marja/hedelmä-jogurttijuoma, jogurtti ja maito [D] | Urheilujuoma, proteiinijuoma, protein smoothie, fast                          | Smoothie, carrot, orange and strawberry smoothie [D]               | Oat product, fermented oat and fruit, yosa smoothie                          |
| 7   | Smoothie, mangosmoothie, jogurtti, ananasmehu [D]            | Kauravalmiste, hapatettu, marja-hedelmä, yosa smoothie, probiootteja          | Smoothie, mango smoothie, yoghurt, pineapple juice [D]             | Sport beverage, protein drink, protein smoothie, fast                        |
| 8   | Smoothie, vihersmoothie, omena, selleri, kurkku [D]          | Jogurtti, juotava, gefilus smoothie, rasvaa 1,4 %, laktoositon, d-vit. 1,5 ug | Smoothie, berry smoothie, yoghurt, oat bran and sunflower seed [D] | Yoghurt, drinkable, gefilus smoothie, 1.4% fat, lactose-free, 1 ug vitamin d |

## Everyday log sheet searches, English

### `bread`

| #   | Before, Finnish names                                                    | After, Finnish names                                                     | Before, English names                                  | After, English names                                           |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------- |
| 1   | Leipäpuuro, vesi, puolukka, mannasuurimo, ruisleipä, sokeria, suolaa [D] | Jauho, jauhoseos, sämpyläjauho, vehnäjauho, ruisjauho, vehnärouhe        | Bread porridge, lingonberries, rye bread, semolina [D] | Flour mixture, for bread rolls, wheat flour, wheat groats, rye |
| 2   | Poro-rieskarulla [D]                                                     | Sekaleipä, nyrkkirieska, ohra, kotitekoinen [D]                          | Gingerbread cake [D]                                   | Multigrain bread, flatbread, barley, home-made [D]             |
| 3   | Makean piirakan murotaikinapohja [D]                                     | Leipäpuuro, vesi, puolukka, mannasuurimo, ruisleipä, sokeria, suolaa [D] | Shortbread biscuit with egg [D]                        | Bread porridge, lingonberries, rye bread, semolina [D]         |
| 4   | Keksi, lusikkaleipä [D]                                                  | Poro-rieskarulla [D]                                                     | Flatbread roll with reindeer [D]                       | Gingerbread cake [D]                                           |
| 5   | Kuivakakku, kermakakku [D]                                               | Makean piirakan murotaikinapohja [D]                                     | Shortbread biscuit without egg [D]                     | Shortbread biscuit with egg [D]                                |
| 6   | Kuivakakku, piimäkakku [D]                                               | Keksi, lusikkaleipä [D]                                                  | Gingerbread cake made with cream [D]                   | Flatbread roll with reindeer [D]                               |
| 7   | Kuivakakku, maustekakku [D]                                              | Kuivakakku, kermakakku [D]                                               | Gingerbread cake made with sourmilk [D]                | Shortbread biscuit without egg [D]                             |
| 8   | Piparkakkutaikina, teollinen [D]                                         | Kuivakakku, piimäkakku [D]                                               | Shortbread pie crust, sweet [D]                        | Gingerbread cake made with cream [D]                           |

### `rye bread`

| #   | Before, Finnish names                            | After, Finnish names                                              | Before, English names                        | After, English names                                           |
| --- | ------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| 1   | Ruissipsi [D]                                    | Jauho, jauhoseos, sämpyläjauho, vehnäjauho, ruisjauho, vehnärouhe | Rye bread snack [D]                          | Flour mixture, for bread rolls, wheat flour, wheat groats, rye |
| 2   | Ruisleipä, ruista 51% [D]                        | Ruissipsi [D]                                                     | Rye bread, 51% rye [D]                       | Rye bread snack [D]                                            |
| 3   | Ruisleipä, varrasleipä [D]                       | Ruisleipä, ruista 51% [D]                                         | Rye bread, dried rye bread [D]               | Rye bread, 51% rye [D]                                         |
| 4   | Ruisleipä, ruissekaleipä [D]                     | Ruisleipä, varrasleipä [D]                                        | Rye bread, potato rye bread [D]              | Rye bread, dried rye bread [D]                                 |
| 5   | Ruisleipä, tumma täysjyväleipä vähäsuolainen [D] | Ruisleipä, ruissekaleipä [D]                                      | Rye bread, rye mixed grain bread [D]         | Rye bread, potato rye bread [D]                                |
| 6   | Ruisleipä, ruispalat, vaasan [D]                 | Ruisleipä, tumma täysjyväleipä vähäsuolainen [D]                  | Rye bread, sweet and sour rye malt bread [D] | Rye bread, rye mixed grain bread [D]                           |
| 7   | Ruisleipä, puikula ruis, fazer [D]               | Ruisleipä, ruispalat, vaasan [D]                                  | Rye bread, puikula, fazer [D]                | Rye bread, sweet and sour rye malt bread [D]                   |
| 8   | Ruisleipä, tosi rukiinen, vaasan [D]             | Ruisleipä, puikula ruis, fazer [D]                                | Rye bread, ruispalat, vaasan [D]             | Rye bread, puikula, fazer [D]                                  |

### `soup`

| #   | Before, Finnish names                                             | After, Finnish names                                              | Before, English names                                                     | After, English names                                                      |
| --- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Hernekeitto, naudanpaistijauheliha [D]                            | Ateriankorvike, keittojauhe, nutrilett                            | Peasoup with medium fat beef [D]                                          | Meal replacement, soup powder, average                                    |
| 2   | Hernekeitto, keskirasvainen naudanliha [D]                        | Ateriankorvike, keittojauhe, tuotekeskiarvo                       | Peasoup with beef steak mince [D]                                         | Meal replacement, soup powder, nutrilett                                  |
| 3   | Ateriankorvike, keittojauhe, nutrilett                            | Ateriankorvike, keittojauhe, peruna/purjo, allevo                 | Meal replacement, soup powder, average                                    | Meal replacement, soup powder, potato and leek, allevo                    |
| 4   | Ateriankorvike, keittojauhe, tuotekeskiarvo                       | Ateriankorvike, keittojauhe, tomaatti/texmex/thai, easy diet      | Meal replacement, soup powder, nutrilett                                  | Meal replacement, soup powder, tomato/texmex/thai, easy diet              |
| 5   | Ateriankorvike, keittojauhe, peruna/purjo, allevo                 | Ateriankorvike, keittojauhe, parsa/kala/kana/sieni, easy diet     | Meal replacement, soup powder, potato and leek, allevo                    | Meal replacement, soup powder, asparagus/fish/chicken/mushroom, easy diet |
| 6   | Ateriankorvike, keittojauhe, tomaatti/texmex/thai, easy diet      | Ateriankorvike, keittojauhe, parsakaali/basilika/couscous, allevo | Meal replacement, soup powder, tomato/texmex/thai, easy diet              | Meal replacement, soup powder, broccoli, basil and couscous, allevo       |
| 7   | Ateriankorvike, keittojauhe, parsa/kala/kana/sieni, easy diet     | Ateriankorvike, keittojauhe ja vesi, keskiarvo [D]                | Meal replacement, soup powder, asparagus/fish/chicken/mushroom, easy diet | Meal replacement, soup powder and water, average [D]                      |
| 8   | Ateriankorvike, keittojauhe, parsakaali/basilika/couscous, allevo | Ateriankorvike, keittojauhe ja vesi, nutrilett [D]                | Meal replacement, soup powder, broccoli, basil and couscous, allevo       | Meal replacement, soup powder and water, nutrilett [D]                    |

### `cheese`

| #   | Before, Finnish names                     | After, Finnish names                                                     | Before, English names              | After, English names                                    |
| --- | ----------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------- |
| 1   | Juustonaksu                               | Juusto, emmentaljuusto, rasvaa 27-30 %, punaleima                        | Cheese puffs                       | Cheese, emmental, 27-30% fat, red-label                 |
| 2   | Juusto, tuotekeskiarvo                    | Juusto, tuotekeskiarvo                                                   | Cheese, average                    | Cheese, average                                         |
| 3   | Juusto, cheddar, rasvaa 34 %              | Juusto, emmentaljuusto, rasvaa 27-30 %, suurikoloinen, sinileima/gruyere | Cheese, polar, 20% fat             | Cheese, emmental, 27-30% fat, blue-label                |
| 4   | Juusto, polar 5 % rasvaa, valio           | Juusto, salaattijuusto, rasvaa 18 %, lehmänmaito, suolaliemessä          | Cheese, cheddar type, 34% fat      | Cheese, feta type salad cheese in brine, 18% fat        |
| 5   | Juusto, polar 10 % rasvaa, valio          | Juusto, sinihomejuusto, rasvaa 27-30 %, aura/danazole, keskiarvo         | Cheese, vegetable fat, 28% fat     | Cheese, blue cheese, aura/danazole, average, 27-30% fat |
| 6   | Juusto, polar 15 % rasvaa, valio          | Juusto, cheddar, rasvaa 34 %                                             | Cheese, halloumi cheese, 22% fat   | Cheese, cheddar type, 34% fat                           |
| 7   | Juusto, leipäjuusto, rasvaa 17-23 %       | Juusto, mozzarella, rasvaa 20 %, tuorejuusto                             | Cheese, mozzarella cheese, 20% fat | Cheese, mozzarella cheese, 20% fat                      |
| 8   | Juusto, rasvaa 28 %, sisältää kasvirasvaa | Juusto, kova pienikoloinen juusto, rasvaa 24-27 %, edam                  | Cheese, polar täyteläinen, 28% fat | Cheese, hard cheese, edam type, 24-27% fat              |

### `coffee`

| #   | Before, Finnish names                                         | After, Finnish names                                          | Before, English names                                         | After, English names                                          |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Kahvi, kahvijuoma, keskiarvo                                  | Kahvi, kahvijuoma, keskiarvo                                  | Coffee, average                                               | Coffee, average                                               |
| 2   | Kahvi, kahvijuoma, murukahvi, pikakahvi, keitetty             | Kahvi, kahvijuoma, murukahvi, pikakahvi, keitetty             | Coffee, instant, drink                                        | Coffee, instant, drink                                        |
| 3   | Kahvijuoma, kylmä, maitokahvijuoma, d-vitamiinia, laktoositon | Kahvijuoma, kylmä, maitokahvijuoma, d-vitamiinia, laktoositon | Coffee beverage, iced coffee, 1.8% fat, lactose-free          | Coffee beverage, iced coffee, 1.8% fat, lactose-free          |
| 4   | Kahvijuoma, kylmä, maitokahvijuoma, rasvaa 1,8 %, laktoositon | Kahvijuoma, kylmä, maitokahvijuoma, rasvaa 1,8 %, laktoositon | Coffee drink, cold, coffee with milk, vitamin d, lactose-free | Coffee drink, cold, coffee with milk, vitamin d, lactose-free |
| 5   | Kahvi, pannukahvijuoma                                        | Kahvi, suodatinkahvijuoma                                     | Boiled coffee drink                                           | Filtered coffee drink                                         |
| 6   | Kahvi, suodatinkahvijuoma                                     | Kahvi, pannukahvijuoma                                        | Filtered coffee drink                                         | Boiled coffee drink                                           |
| 7   | Kahvi, murukahvi, pikakahvi, valmistamaton                    | Kahvi, murukahvi, pikakahvi, valmistamaton                    | Instant coffee, powder                                        | Instant coffee, powder                                        |
| 8   | Maito, kahvimaito, rasvaa 2 %, laktoositon, d-vitamiinia 1ug  | Maito, kahvimaito, rasvaa 2 %, laktoositon, d-vitamiinia 1ug  | Milk, coffee milk 2% fat, lactose-free, 1 ug added vitamin d  | Milk, coffee milk 2% fat, lactose-free, 1 ug added vitamin d  |

### `porridge`

| #   | Before, Finnish names              | After, Finnish names               | Before, English names                       | After, English names                        |
| --- | ---------------------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------------- |
| 1   | Nalle kuitupuuroseos, hiutale      | Nalle kuitupuuroseos, hiutale      | Porridge flake mix with fibre, nalle        | Porridge flake mix with fibre, nalle        |
| 2   | Nalle kuitupuuro, vesi, suolaa [D] | Nalle kuitupuuro, vesi, suolaa [D] | Porridge with fibre, water, salt, nalle [D] | Porridge with fibre, water, salt, nalle [D] |
| 3   | Mämmi [D]                          | Kaurapuuro, vesi, suolaa [D]       | Raw porridge, yoghurt [D]                   | Maize porridge, polenta [D]                 |
| 4   | Tuorepuuro, jogurtti [D]           | Grahampuuro, vesi, suolaa [D]      | Maize porridge, polenta [D]                 | Rice porridge, water, salt [D]              |
| 5   | Kaurapuuro, vesi, suolaa [D]       | Hirssipuuro, vesi, suolaa [D]      | Semolina lingonberry porridge, whipped [D]  | Graham porridge, water, salt [D]            |
| 6   | Grahampuuro, vesi, suolaa [D]      | Kaurapuuro, vesi, suolaton [D]     | Rice porridge, milk, salt [D]               | Millet porridge, water, salt [D]            |
| 7   | Hirssipuuro, vesi, suolaa [D]      | Tattaripuuro, vesi, suolaa [D]     | Rice porridge, water, salt [D]              | Buckwheat porridge, water, salt [D]         |
| 8   | Mannapuuro, maito, suolaa [D]      | Talkkunapuuro, vesi, suolaa [D]    | Millet porridge, milk, salt [D]             | Mixed flake porridge, water, salt [D]       |
