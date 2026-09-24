"""Build the bundled league manifest from explicit, reviewed club membership."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / 'data/m26/catalog.json').read_text())
leagues = []
assigned = set()
def add(country, tier, name, expected, names, source, season=None):
    teams = [t for t in catalog['teams'] if t['country'] == country]
    names = names.split('|') if names != '*' else [t['name'] for t in teams if t['id'] not in assigned]
    lookup = {t['name']:t for t in teams}
    assert all(n in lookup for n in names), (country, set(names)-lookup.keys())
    ids = [lookup[n]['id'] for n in names]
    assert not (set(ids)&assigned), name
    assigned.update(ids)
    leagues.append(dict(id=f'{country.lower()}-{tier}',country=country,tier=tier,name=name,season=season or ('2026/27' if country in ['DEU','ENG','ESP','FRA','ITA','PRT','TUR','NLD','RUS','SAU','MEX','JPN'] else '2026'),expectedClubs=expected,teamIds=ids,sources=[source]))
add('BRA',1,'Brasileirão Série A',20,'Athletico Paranaense|Atlético Mineiro|Bahia|Botafogo|Chapecoense|Corinthians|Coritiba|Cruzeiro|Flamengo|Fluminense|Grêmio|Internacional|Mirassol|Palmeiras|Red Bull Bragantino|Remo|Santos|São Paulo|Vasco|Vitória','https://ge.globo.com/pi/futebol/noticia/2025/12/29/brasileirao-veja-os-156-clubes-das-series-a-b-c-e-d-em-2026.ghtml')
add('BRA',2,'Brasileirão Série B',20,'América-MG|Athletic Club|Atlético Goianiense|Avaí|Botafogo-SP|Ceará|CRB|Criciúma|Cuiabá|Fortaleza|Goiás|Juventude|Londrina|Náutico|Novorizontino|Operário-PR|Ponte Preta|São Bernardo|Sport|Vila Nova',leagues[-1]['sources'][0])
add('BRA',3,'Brasileirão Série C',20,'Amazonas|Anápolis|Barra|Botafogo-PB|Brusque|Caxias|Confiança|Ferroviária|Figueirense|Floresta|Guarani|Inter de Limeira|Itabaiana|Ituano|Maranhão|Maringá|Paysandu|Santa Cruz|Volta Redonda|Ypiranga de Erechim',leagues[-1]['sources'][0])
add('ESP',1,'LaLiga',20,'Athletic Bilbao|Atlético de Madrid|Osasuna|Celta de Vigo|Deportivo Alavés|Elche|Barcelona|Getafe|Levante|Málaga|Racing Santander|Rayo Vallecano|Deportivo La Coruña|Espanyol|Real Betis|Real Madrid|Real Sociedad|Sevilla|Valencia|Villarreal','https://www.laliga.com/en-GB/laliga-easports/clubs')
add('ESP',2,'Segunda División',22,'Ceuta|Albacete|Burgos|Cádiz|Castellón|Eldense|Leganés|Tenerife|Sabadell|Celta Fortuna|Córdoba|Andorra|Girona|Granada|Real Sociedad B|Mallorca|Real Oviedo|Sporting Gijón|Real Valladolid|Eibar|Almería|Las Palmas','https://www.laliga.com/laliga-hypermotion/clubes')
add('DEU',1,'Bundesliga',18,'Augsburg|Union Berlin|Werder Bremen|Borussia Dortmund|Elversberg|Eintracht Frankfurt|Freiburg|Hamburgo|Hoffenheim|Köln|RB Leipzig|Bayer Leverkusen|Mainz 05|Borussia Mönchengladbach|Bayern|Paderborn 07|Schalke 04|Stuttgart','https://www.bundesliga.com/de/bundesliga/clubs')
add('DEU',2,'2. Bundesliga',18,'Arminia Bielefeld|Bochum|Eintracht Braunschweig|Energie Cottbus|Darmstadt 98|Dynamo Dresden|Greuther Fürth|Hannover 96|Heidenheim|Hertha BSC|Kaiserslautern|Karlsruher|Holstein Kiel|Magdeburg|Nuremberg|Osnabrück|St. Pauli|Wolfsburg','https://www.bundesliga.com/de/2bundesliga/clubs')
add('ENG',1,'Premier League',20,'Arsenal|Aston Villa|Bournemouth|Brentford|Brighton|Chelsea|Coventry City|Crystal Palace|Everton|Fulham|Hull City|Ipswich Town|Leeds United|Liverpool|Manchester City|Manchester United|Newcastle|Nottingham Forest|Sunderland|Tottenham','https://www.premierleague.com/en/news/4673099/the-202627-premier-league-season-officially-starts')
add('ENG',2,'Championship',24,'Birmingham City|Blackburn|Bolton|Bristol City|Burnley|Cardiff City|Charlton Athletic|Derby County|Lincoln City|Middlesbrough|Millwall|Norwich City|Portsmouth|Preston North End|Queens Park Rangers|Sheffield United|Southampton|Stoke City|Swansea City|Watford|West Bromwich|West Ham United|Wolverhampton|Wrexham','https://www.fourfourtwo.com/competition/watch-efl-championship-2026-27-free')
add('ENG',3,'League One',24,'*','https://en.wikipedia.org/wiki/2026%E2%80%9327_EFL_League_One')
add('ITA',1,'Serie A',20,'Atalanta|Bologna|Cagliari|Como|Fiorentina|Frosinone|Genoa|Internazionale|Juventus|Lazio|Lecce|Milan|Monza|Napoli|Parma|Roma|Sassuolo|Torino|Udinese|Venezia','https://sport.sky.it/calcio/serie-b/serie-b-2026-playoff-playout-promozioni-retrocessioni')
add('FRA',1,'Ligue 1',18,'Angers|Auxerre|Brest|Le Havre|Le Mans|Lens|Lille|Lorient|Lyon|Monaco|Nice|Olympique Marseille|Paris|Paris Saint-Germain|Rennes|Strasbourg|Toulouse|Troyes','https://www.lequipe.fr/Football/ligue-1/page-participants')
add('PRT',1,'Primeira Liga',18,'Académico Viseu|Alverca|Arouca|Benfica|Braga|Casa Pia|CD Nacional|Estoril Praia|Estrela Amadora|Famalicão|Gil Vicente|Marítimo|Moreirense|Porto|Rio Ave|Santa Clara|Sporting|Vitória Guimarães','https://www.sporting.pt/pt/futebol-seniores-m-2026/2027')
# Further reviewed memberships below.
add('ITA',2,'Serie B',20,'Cremonese|Hellas Verona|Pisa|Avellino|Carrarese|Catanzaro|Cesena|Empoli|Virtus Entella|Juve Stabia|Mantova|Modena|Padova|Palermo|Sampdoria|Südtirol|Vicenza|Arezzo|Benevento|Ascoli','https://sport.sky.it/calcio/serie-b/squadre-serie-b-2026-2027')
add('ITA',3,'Serie C',60,'*','https://www.rsssf.org/tablesi/ital2026.html')
add('FRA',2,'Ligue 2',18,'Saint-Étienne|Red Star|Stade de Reims|Montpellier|Metz|Nancy|Annecy|Sochaux|Dijon|Pau|Dunkerque|Guingamp|Grenoble|Rodez|Nantes|Clermont|Boulogne|Stade Lavallois','https://www.fcnantes.com/articles/20262027/classement.php')
add('FRA',3,'Ligue 3',18,'*','https://www.fff.fr/competition/engagement/440455-ligue-3/phase/1/index.html')
add('PRT',2,'Liga Portugal 2',18,'AVS|Sporting B|Benfica B|Leixões|Chaves|Académica Coimbra|Farense|Torreense|Feirense|Felgueiras|Lusitânia Lourosa|Porto B|Penafiel|Portimonense|Tondela|Amarante|Vizela|União de Leiria','https://static.publico.pt/infografia/2026/iframes/desporto/calendario-ii-liga.html')
add('PRT',3,'Liga 3',20,'*','https://www.zerozero.pt/competicao/liga-3')
add('DEU',3,'3. Liga',20,'*','https://www.dfb.de/3-liga')
add('ESP',3,'Primera Federación',40,'*','https://rfef.es/es/competiciones/primera-federacion')
add('TUR',1,'Süper Lig',18,'Alanyaspor|Amedspor|Başakşehir|Besiktas|Erzurumspor|Eyüpspor|Fenerbahce|Galatasaray|Gaziantep|Genclerbirligi|Göztepe|Kasimpasa|Kocaelispor|Konyaspor|Rizespor|Samsunspor|Trabzonspor|Çorum','https://www.tff.org/Default.aspx?pageID=198')
add('TUR',2,'1. Lig',20,'Esenler Erokspor|Sivasspor|Igdir|Sariyer|Bodrum|Antalyaspor|Kayserispor|Fatih Karagümrük|Bursaspor|Batman Petrolspor|Muglaspor|Ümraniyespor|Pendikspor|Istanbulspor|Vanspor|Bandirmaspor|Keciörengücü|Manisa|Boluspor|Mardin 1969','https://www.tff.org/Default.aspx?pageID=142')
add('TUR',3,'2. Lig',36,'*','https://www.tff.org/Default.aspx?pageID=976')
add('ARG',1,'Liga Profesional',30,'Aldosivi|Argentinos Juniors|Atlético Tucumán|Banfield|Barracas Central|Belgrano|Boca Juniors|Central Córdoba (SdE)|Defensa y Justicia|Deportivo Riestra|Estudiantes|Estudiantes de Río Cuarto|Gimnasia de Mendoza|Gimnasia La Plata|Huracán|Independiente|Independiente Rivadavia|Instituto|Lanús|Newell\'s Old Boys|Platense|Racing|River Plate|Rosario Central|San Lorenzo|Sarmiento de Junin|Talleres|Tigre|Unión Santa Fe|Vélez Sarsfield','https://en.wikipedia.org/wiki/2026_AFA_Liga_Profesional_de_F%C3%BAtbol')
add('ARG',2,'Primera Nacional',36,'*','https://www.afa.com.ar/es/pages/primera-nacional')
add('BRA',4,'Brasileirão Série D',96,'|'.join(t['name'] for t in catalog['teams'] if t['country']=='BRA' and t['id'] not in assigned and t['name']!='Manthiqueira'),leagues[0]['sources'][0])
add('BRA',5,'Paulista Sub-23 Segunda Divisão',24,'Manthiqueira','https://ge.globo.com/sp/vale-do-paraiba-regiao/futebol/times/manthiqueira/')
add('NLD',1,'Eredivisie',18,'*','https://eredivisie.nl/competitie/clubs/')
add('URY',1,'Primera División',16,'*','https://www.auf.org.uy/uruguayo-1-division/')
add('COL',1,'Primera A',20,'*','https://dimayor.com.co/liga-betplay-dimayor/')
add('PRY',1,'División de Honor',12,'*','https://www.apf.org.py/primera-division-4')
add('USA',1,'Major League Soccer',30,'*','https://www.mlssoccer.com/clubs/')
add('MEX',1,'Liga MX',18,'*','https://ligamx.net/')
add('SAU',1,'Saudi Pro League',18,'*','https://www.spl.com.sa/en/teams')
add('RUS',1,'Premier Liga',16,'*','https://premierliga.ru/tournament-table/')
add('JPN',1,'J1 League',20,'*','https://www.jleague.co/clubs/j1/')
assert len(assigned)==len(catalog['teams'])
# Exact pages used in the membership review (keep these with the distributable manifest).
reviewed_sources = {
 'arg-2': ['https://www.afa.com.ar/n/posts/primera-nacional-fixture-para-la-temporada-2026'],
 'bra-4': [leagues[0]['sources'][0], 'https://pt.wikipedia.org/wiki/Campeonato_Brasileiro_de_Futebol_de_2026_-_S%C3%A9rie_D'],
 'deu-3': ['https://www.dfb.de/news/teilnehmerfeld-der-3-liga-steht-fest-havelse-rueckt-fuer-1860-nach'],
 'esp-3': ['https://rfef.es/es/noticias/aprobados-los-grupos-de-primera-federacion-para-la-temporada-202627'],
 'fra-3': ['https://va-fc.com/articles/le-calendrier-de-la-saison-26%2F27-est-sorti-%21-34021'],
 'ita-3': ['https://www.speziacalcio.com/news/serie-c-2627-date-e-orari-delle-prime-otto-giornate.28491.html', 'https://www.gazzetta.it/calcio/serie-c/30-07-2026/calendario-serie-c-2026-2027-giornate-partite-dettagli.shtml'],
 'prt-3': ['https://progressodeparedes.com.pt/ja-e-conhecido-o-calendario-da-primeira-fase-da-liga-3-placard-2026-27/'],
 'tur-3': ['https://www.sporx.com/turkiye-2-lig-takimlar', 'https://www.tff.org/Resources/TFF/Documents/STATULER/2026-2027/2026-2027-sezonu-tff-2-lig-musabakalari-statusu.pdf'],
 'jpn-1': ['https://www.jleague.jp/en/j1/club/'],
 'mex-1': ['https://www.footmercato.net/mexique/liga-mx/club'],
 'col-1': ['https://en.wikipedia.org/wiki/2026_Liga_DIMAYOR'],
 'pry-1': ['https://www.apf.org.py/partidos/temporada-2026-paraguay-primera-division-clausura-5-recoleta-vs-2-de-mayo-848'],
 'rus-1': ['https://www.lequipe.fr/Football/championnat-de-russie/saison-2026-2027/page-participants'],
 'sau-1': ['https://www.spl.com.sa/en/news/spl-announces-2026-27-rsl-fixture-schedule'],
 'ury-1': ['https://es.wikipedia.org/wiki/Campeonato_Uruguayo_de_Primera_Divisi%C3%B3n_2026'],
 'usa-1': ['https://www.mlssoccer.com/news/mls-unveils-2026-regular-season-schedule'],
}
for league in leagues:
    if league['id'] in reviewed_sources: league['sources'] = reviewed_sources[league['id']]
# Real membership; game format is deliberately disclosed separately from official rules.
for l in leagues:
    l['partial'] = len(l['teamIds']) != l['expectedClubs']
    l['playable'] = len(l['teamIds']) >= 2
    l['format'] = 'double-round-robin'
    l['note'] = 'Calendário do jogo em turno e returno. Sem grupos, mata-mata, acesso ou rebaixamento nesta versão.'
    if l['partial']: l['note'] += f" Base parcial: {len(l['teamIds'])} de {l['expectedClubs']} clubes."
    if not l['playable']: l['note'] += ' Disponível no mercado; faltam adversários desta divisão para iniciar uma carreira.'
leagues.sort(key=lambda l:(l['country'],l['tier']))
(ROOT/'data/world/leagues.json').write_text(json.dumps(dict(version=1,verifiedAt='2026-09-22',leagues=leagues),ensure_ascii=False,indent=2)+'\n')
print(f'{len(leagues)} ligas; {len(assigned)} clubes; {sum(l["playable"] for l in leagues)} ligas jogáveis')

# Keep the coverage and references document synchronized with the manifest.
readme_path = ROOT/'data/world/README.md'
intro = readme_path.read_text().split('| País |')[0]
rows = ['| País | Campeonato | Temporada | Presentes / total | Referências |', '| --- | --- | --- | --- | --- |']
for league in leagues:
    references = ', '.join(f'[Fonte {i+1}]({url})' for i, url in enumerate(league['sources']))
    rows.append(f"| {league['country']} | {league['name']} | {league['season']} | {len(league['teamIds'])} / {league['expectedClubs']} | {references} |")
readme_path.write_text(intro + '\n'.join(rows) + '\n')
