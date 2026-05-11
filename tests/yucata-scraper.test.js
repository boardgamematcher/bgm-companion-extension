const { describe, test, expect } = require('@jest/globals');
const YucataScraper = require('../src/content/yucata-scraper.js');

describe('YucataScraper', () => {
  const mockDataTableRows = [
    {
      GameTypeId: 57,
      GameTypeName: 'Maori',
      FinishedOnString: '09.04.2026',
      NumPlayers: 2,
      FinalPosition: 1,
    },
    {
      GameTypeId: 1,
      GameTypeName: 'Carcassonne',
      FinishedOnString: '08.04.2026',
      NumPlayers: 3,
      FinalPosition: 2,
    },
  ];

  test('parses DataTable rows into play objects', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows(mockDataTableRows);

    expect(plays).toHaveLength(2);
    expect(plays[0]).toEqual({
      yucataId: '57',
      gameName: 'Maori',
      date: '2026-04-09',
      playerCount: 2,
      outcome: 'win',
    });
    expect(plays[1]).toEqual({
      yucataId: '1',
      gameName: 'Carcassonne',
      date: '2026-04-08',
      playerCount: 3,
      outcome: 'loss',
    });
  });

  test('handles empty rows', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([]);
    expect(plays).toHaveLength(0);
  });

  test('skips rows with missing GameTypeId', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([
      mockDataTableRows[0],
      { GameTypeName: 'Invalid', FinishedOnString: '01.01.2026', NumPlayers: 2, FinalPosition: 1 },
    ]);
    expect(plays).toHaveLength(1);
  });

  test('skips rows with malformed date', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([
      mockDataTableRows[0],
      {
        GameTypeId: 2,
        GameTypeName: 'Bad Date',
        FinishedOnString: 'invalid',
        NumPlayers: 2,
        FinalPosition: 1,
      },
    ]);
    expect(plays).toHaveLength(1);
  });

  test('converts FinalPosition 1 to win and other ranks to loss', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([
      {
        GameTypeId: 1,
        GameTypeName: 'A',
        FinishedOnString: '01.01.2026',
        NumPlayers: 4,
        FinalPosition: 1,
      },
      {
        GameTypeId: 2,
        GameTypeName: 'B',
        FinishedOnString: '01.01.2026',
        NumPlayers: 4,
        FinalPosition: 2,
      },
      {
        GameTypeId: 3,
        GameTypeName: 'C',
        FinishedOnString: '01.01.2026',
        NumPlayers: 4,
        FinalPosition: 3,
      },
    ]);
    expect(plays[0].outcome).toBe('win');
    expect(plays[1].outcome).toBe('loss');
    expect(plays[2].outcome).toBe('loss');
  });

  test('returns null outcome when FinalPosition is missing or 0 (not loss)', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([
      {
        GameTypeId: 1,
        GameTypeName: 'Solo',
        FinishedOnString: '01.01.2026',
        NumPlayers: 1,
        FinalPosition: 0,
      },
      { GameTypeId: 2, GameTypeName: 'Unknown', FinishedOnString: '01.01.2026', NumPlayers: 2 },
      {
        GameTypeId: 3,
        GameTypeName: 'Null',
        FinishedOnString: '01.01.2026',
        NumPlayers: 2,
        FinalPosition: null,
      },
    ]);
    expect(plays[0].outcome).toBeNull();
    expect(plays[1].outcome).toBeNull();
    expect(plays[2].outcome).toBeNull();
  });

  test('uses RankingResult to distinguish win / draw / loss', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([
      // Sole first: RankingResult=2, FinalPosition=1 → win
      {
        GameTypeId: 1,
        GameTypeName: 'SoleFirst',
        FinishedOnString: '01.01.2026',
        NumPlayers: 2,
        FinalPosition: 1,
        RankingResult: 2,
      },
      // Shared first: RankingResult=1, FinalPosition=1 → draw
      {
        GameTypeId: 2,
        GameTypeName: 'SharedFirst',
        FinishedOnString: '01.01.2026',
        NumPlayers: 2,
        FinalPosition: 1,
        RankingResult: 1,
      },
      // Not first: RankingResult=0 → loss
      {
        GameTypeId: 3,
        GameTypeName: 'Lost',
        FinishedOnString: '01.01.2026',
        NumPlayers: 2,
        FinalPosition: 2,
        RankingResult: 0,
      },
    ]);
    expect(plays[0].outcome).toBe('win');
    expect(plays[1].outcome).toBe('draw');
    expect(plays[2].outcome).toBe('loss');
  });

  test('RankingResult takes precedence over FinalPosition when both present', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([
      // FinalPosition alone would say "win", but RankingResult=1 means it was actually a draw
      {
        GameTypeId: 1,
        GameTypeName: 'Tie',
        FinishedOnString: '01.01.2026',
        NumPlayers: 2,
        FinalPosition: 1,
        RankingResult: 1,
      },
    ]);
    expect(plays[0].outcome).toBe('draw');
  });

  test('drops Yucata "Secret Mystery Game" rows (GameTypeId === -1)', () => {
    const scraper = YucataScraper();
    const plays = scraper.parseDataTableRows([
      mockDataTableRows[0],
      {
        GameTypeId: -1,
        GameTypeName: 'Secret Mystery Game',
        FinishedOnString: '10.04.2026',
        NumPlayers: 2,
        FinalPosition: 1,
        RankingResult: 2,
      },
    ]);
    expect(plays).toHaveLength(1);
    expect(plays[0].gameName).toBe('Maori');
  });
});
