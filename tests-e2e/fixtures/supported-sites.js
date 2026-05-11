// Sample URLs that should match each built-in profile's url_pattern.
// Keep one entry per profile in patterns/built-in.json so the supported-sites
// spec covers every shop the manifest's content scripts target.
export const SUPPORTED_URLS = [
  { url: 'https://www.veepee.fr/fr/catalog/jeux-de-societe', expectedName: /Veepee/ },
  { url: 'https://www.philibertnet.com/fr/123/flash-sales', expectedName: /Philibert Flash/ },
  { url: 'https://www.philibertnet.com/fr/123/promotions', expectedName: /Philibert Promotions/ },
  { url: 'https://www.philibertnet.com/fr/', expectedName: /Philibert Homepage/ },
  {
    url: 'https://www.philibertnet.com/fr/some-game/12345-some-game.html',
    expectedName: /Philibert Product Page/,
  },
  { url: 'https://www.philibertnet.com/fr/category/12-strategy', expectedName: /Philibert/ },
  { url: 'https://www.amazon.com/s?k=board+games', expectedName: /Amazon Search/ },
  { url: 'https://www.amazon.com/gp/bestsellers/toys', expectedName: /Amazon Best Sellers/ },
  { url: 'https://www.knapix.com/2025/11/top-games', expectedName: /Knapix/ },
  { url: 'https://www.cultura.com/jeux-de-societe', expectedName: /Cultura/ },
  { url: 'https://www.fnac.com/SearchResult/ResultList.aspx?Search=jeux', expectedName: /Fnac/ },
  { url: 'https://www.espritjeu.com/jeux-de-societe.html', expectedName: /Esprit Jeu/ },
  { url: 'https://www.ludum.fr/categorie/jeux', expectedName: /Ludum/ },
  { url: 'https://www.le-passe-temps.com/category/jeux', expectedName: /Le Passe-Temps/ },
  { url: 'https://www.okkazeo.com/jeux/liste/recent', expectedName: /Okkazeo/ },
  { url: 'https://www.lepion.com/jeux-de-societe', expectedName: /Le Pion/ },
  { url: 'https://www.gamersdream.shop/collections/board-games', expectedName: /Gamers Dream/ },
  { url: 'https://www.ludisphere.fr/jeux-de-societe', expectedName: /Ludisphere/ },
  { url: 'https://www.ludifolie.com/jeux-de-societe', expectedName: /Ludifolie/ },
  {
    url: 'https://www.coolstuffinc.com/main_browse.php?cat=board-games',
    expectedName: /CoolStuffInc/,
  },
  { url: 'https://www.miniaturemarket.com/board-games.html', expectedName: /Miniature Market/ },
  { url: 'https://www.boardgamebliss.com/collections/all', expectedName: /BoardGameBliss/ },
  { url: 'https://www.board-game.co.uk/collections/all', expectedName: /Zatu/ },
  { url: 'https://www.gamenerdz.com/board-games', expectedName: /GameNerdz/ },
  { url: 'https://www.brettspielversand.de/brettspiele', expectedName: /brettspielversand/ },
  { url: 'https://www.milan-spiele.de/Brettspiele', expectedName: /Milan Spiele/ },
  { url: 'https://www.fantasywelt.de/brettspiele', expectedName: /Fantasywelt/ },
  { url: 'https://www.spiele-offensive.de/brettspiele', expectedName: /Spiele-Offensive/ },
  { url: 'https://www.thalia.de/kategorie/spielwaren-brettspiele', expectedName: /Thalia/ },
  { url: 'https://www.kutami.de/brettspiele', expectedName: /Kutami/ },
  { url: 'https://www.spieletaxi.de/brettspiele', expectedName: /Spieletaxi/ },
  { url: 'https://www.bol.com/nl/nl/l/gezelschapsspellen/', expectedName: /Bol/ },
  { url: 'https://www.coolshop.dk/produkt/braetspil/', expectedName: /Coolshop/ },
];

export const UNSUPPORTED_URLS = [
  'https://example.com/',
  'https://www.google.com/search?q=board+games',
  'https://www.wikipedia.org/wiki/Catan',
];
