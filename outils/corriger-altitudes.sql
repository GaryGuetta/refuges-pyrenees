-- =============================================================================
-- corriger-altitudes.sql
-- Généré le 2026-07-15 00:26 par outils/corriger-altitudes.mjs
--
-- Corrige les altitudes où refuges.info ET OpenStreetMap s'accordent
-- entre eux (±5 m) contre notre valeur, avec un écart ≥ 50 m.
--
-- Ces deux sources sont indépendantes l'une de l'autre et de la nôtre.
-- Les cas où une seule source nous contredit ont été volontairement
-- écartés : ils sont souvent dus à une erreur de leur côté.
--
-- À FAIRE AVANT : relis la liste. À FAIRE APRÈS : git push, pour que les
-- pages statiques /refuge/xxx se régénèrent avec les bonnes valeurs.
-- =============================================================================

begin;

-- Cabane de Bazets  (refuges.info : 1450 m, OSM : 1450 m)
update refuges set altitude = 1450, maj_le = now()
  where id = 'cabane-de-bazets-42-7748-1-3287' and altitude = 1140;

-- Cabane de l'Estany de Comassa  (refuges.info : 2165 m, OSM : 2165 m)
update refuges set altitude = 2165, maj_le = now()
  where id = 'cabane-de-l-estany-de-comassa-42-5645-1-9784' and altitude = 1950;

-- Cabane de Maucapera  (refuges.info : 2005 m, OSM : 2005 m)
update refuges set altitude = 2005, maj_le = now()
  where id = 'cabane-de-maucapera-42-8358-0-0521' and altitude = 2207;

-- Caseta forestal dels Pollineres  (refuges.info : 2130 m, OSM : 2130 m)
update refuges set altitude = 2130, maj_le = now()
  where id = 'caseta-forestal-dels-pollineres-42-4455-1-6103' and altitude = 1940;

-- Refuge de la Gola  (refuges.info : 2231 m, OSM : 2231 m)
update refuges set altitude = 2231, maj_le = now()
  where id = 'refuge-de-la-gola-42-6811-1-1708' and altitude = 2100;

-- Cabane Saube  (refuges.info : 1530 m, OSM : 1530 m)
update refuges set altitude = 1530, maj_le = now()
  where id = 'cabane-saube-42-7399-1-2131' and altitude = 1400;

-- Cabane Pastorale de l'Estanyol  (refuges.info : 1480 m, OSM : 1480 m)
update refuges set altitude = 1480, maj_le = now()
  where id = 'cabane-pastorale-de-l-estanyol-42-5176-2-5243' and altitude = 1350;

-- Refuge de Prat-Cabrera  (refuges.info : 1530 m, OSM : 1530 m)
update refuges set altitude = 1530, maj_le = now()
  where id = 'refuge-de-prat-cabrera-42-5347-2-4943' and altitude = 1650;

-- Refuge de Bartat  (refuges.info : 940 m, OSM : 940 m)
update refuges set altitude = 940, maj_le = now()
  where id = 'refuge-de-bartat-42-9163-1-6085' and altitude = 850;

-- Abri de Etang Tort  (refuges.info : 2333 m, OSM : 2333 m)
update refuges set altitude = 2333, maj_le = now()
  where id = 'abri-de-etang-tort-42-6416-1-8931' and altitude = 2250;

-- Cabane Cortalets  (refuges.info : 1970 m, OSM : 1970 m)
update refuges set altitude = 1970, maj_le = now()
  where id = 'cabane-cortalets-42-5383-2-4600' and altitude = 2040;

-- Cabane Aguilous  (refuges.info : 2285 m, OSM : 2285 m)
update refuges set altitude = 2285, maj_le = now()
  where id = 'cabane-aguilous-42-7564-0-1120' and altitude = 2220;

-- Cabane du Couret  (refuges.info : 1420 m, OSM : 1420 m)
update refuges set altitude = 1420, maj_le = now()
  where id = 'cabane-du-couret-43-0236-0-0431' and altitude = 1485;

-- Cabane Courille  (refuges.info : 1714 m, OSM : 1714 m)
update refuges set altitude = 1714, maj_le = now()
  where id = 'cabane-courille-42-8449-1-0495' and altitude = 1650;

-- Cabane Setut  (refuges.info : 2310 m, OSM : 2310 m)
update refuges set altitude = 2310, maj_le = now()
  where id = 'cabane-setut-42-4826-1-6423' and altitude = 2250;

-- Cabane de la Balmette  (refuges.info : 2040 m, OSM : 2040 m)
update refuges set altitude = 2040, maj_le = now()
  where id = 'cabane-de-la-balmette-42-6635-2-2138' and altitude = 2100;

-- Cabane Jaça de Llosa  (refuges.info : 1760 m, OSM : 1760 m)
update refuges set altitude = 1760, maj_le = now()
  where id = 'cabane-jaca-de-llosa-42-6405-2-0322' and altitude = 1700;

-- Cabane Jasse Cady  (refuges.info : 1920 m, OSM : 1920 m)
update refuges set altitude = 1920, maj_le = now()
  where id = 'cabane-jasse-cady-42-5055-2-4312' and altitude = 1975;

-- Cabane Courrau (D Antenac)  (refuges.info : 1687 m, OSM : 1687 m)
update refuges set altitude = 1687, maj_le = now()
  where id = 'cabane-courrau-d-antenac-42-8304-0-5693' and altitude = 1741;

-- Refuge Angel'Orus - Forcau  (refuges.info : 2150 m, OSM : 2150 m)
update refuges set altitude = 2150, maj_le = now()
  where id = 'refuge-angel-orus-forcau-42-6275-0-4574' and altitude = 2100;

-- Cabane d'Aoua  (refuges.info : 1370 m, OSM : 1370 m)
update refuges set altitude = 1370, maj_le = now()
  where id = 'cabane-d-aoua-42-8161-0-9344' and altitude = 1320;

-- Cabane d'Aouen  (refuges.info : 1600 m, OSM : 1600 m)
update refuges set altitude = 1600, maj_le = now()
  where id = 'cabane-d-aouen-42-8317-1-0528' and altitude = 1550;

-- Cabane de l'Etang d'Araing  (refuges.info : 1915 m, OSM : 1915 m)
update refuges set altitude = 1915, maj_le = now()
  where id = 'cabane-de-l-etang-d-araing-42-8339-0-8794' and altitude = 1965;

-- Cabane de la Pleta de les Escaldes  (refuges.info : 1825 m, OSM : 1825 m)
update refuges set altitude = 1825, maj_le = now()
  where id = 'cabane-de-la-pleta-de-les-escaldes-42-5111-1-9497' and altitude = 1775;

-- Refuge forestier de Baserca  (refuges.info : 1450 m, OSM : 1450 m)
update refuges set altitude = 1450, maj_le = now()
  where id = 'refuge-forestier-de-baserca-42-5978-0-7630' and altitude = 1500;

-- Vérifie le nombre de lignes touchées avant de valider.
-- Attendu : 25 ligne(s).
-- Si le compte est bon :  commit;
-- Sinon :                 rollback;

commit;
