// Unit tests for the CDN-card -> DB-row matcher in update-cards-github.js.
//
// Written when `previous_names` matching was added. Card names are the join key
// between cards.json and the `cards` table, so an unmatched rebrand INSERTs a
// duplicate row under a fresh card_id and strands the original's ratings,
// card_stats and card_wire history. These tests pin the resolution order and,
// more importantly, the guards that stop the rename fallback from letting one
// card absorb another's history.

const { _buildCardMatcher } = require("../src/handlers/update-cards-github");

const row = (id, name) => ({ card_id: id, card_name: name });

describe("buildCardMatcher", () => {
  test("matches on exact current name", () => {
    const match = _buildCardMatcher([row(1, "Chase Sapphire Preferred")], []);
    expect(match({ name: "Chase Sapphire Preferred" })).toEqual(row(1, "Chase Sapphire Preferred"));
  });

  test("still tolerates legacy suffix drift in both directions", () => {
    const dbHasSuffix = _buildCardMatcher([row(1, "Amazon Store Card")], []);
    expect(dbHasSuffix({ name: "Amazon Store" }).card_id).toBe(1);

    const cdnHasSuffix = _buildCardMatcher([row(2, "Amazon Store")], []);
    expect(cdnHasSuffix({ name: "Amazon Store Card" }).card_id).toBe(2);
  });

  test("returns null for a genuinely new card", () => {
    const match = _buildCardMatcher([row(1, "Existing")], []);
    expect(match({ name: "Brand New Card" })).toBeNull();
  });

  test("matches a rebrand via previous_names", () => {
    const cdn = [
      {
        name: "Citi AAdvantage Executive World Legend Mastercard",
        previous_names: ["Citi AAdvantage Executive World Elite Mastercard"],
      },
    ];
    const match = _buildCardMatcher(
      [row(7, "Citi AAdvantage Executive World Elite Mastercard")],
      cdn
    );
    // The whole point: the renamed card keeps card_id 7 rather than being
    // inserted fresh, so its ratings and wire history survive the rename.
    expect(match(cdn[0]).card_id).toBe(7);
  });

  test("a card's CURRENT name beats another card's previous_names", () => {
    // "Chase Freedom Student" was retired into Chase Freedom Rise. If a card
    // called "Chase Freedom Student" ever exists again, the row belongs to the
    // card actually named that today, not to Rise.
    const revived = { name: "Chase Freedom Student" };
    const rise = { name: "Chase Freedom Rise", previous_names: ["Chase Freedom Student"] };
    const cdn = [rise, revived];
    const match = _buildCardMatcher([row(3, "Chase Freedom Student")], cdn);

    expect(match(rise)).toBeNull();
    expect(match(revived).card_id).toBe(3);
  });

  test("an old name claimed by two cards matches neither", () => {
    // A split (one product becoming two) must not let whichever card is
    // processed first silently absorb the shared history.
    const a = { name: "Split A", previous_names: ["Original"] };
    const b = { name: "Split B", previous_names: ["Original"] };
    const cdn = [a, b];
    const match = _buildCardMatcher([row(9, "Original")], cdn);

    expect(match(a)).toBeNull();
    expect(match(b)).toBeNull();
  });

  test("one row is never matched twice in a run", () => {
    const a = { name: "New A", previous_names: ["Old"] };
    const b = { name: "New B", previous_names: ["Old"] };
    // Only `a` declares it at build time, so `b` is added after the ambiguity
    // scan; the consumed-set guard is what stops the double match.
    const match = _buildCardMatcher([row(4, "Old")], [a]);

    expect(match(a).card_id).toBe(4);
    expect(match(b)).toBeNull();
  });

  test("previous_names entries tolerate suffix drift too", () => {
    const cdn = [{ name: "Renamed", previous_names: ["Old Name"] }];
    const match = _buildCardMatcher([row(5, "Old Name Credit Card")], cdn);
    expect(match(cdn[0]).card_id).toBe(5);
  });

  test("handles cards with no previous_names field", () => {
    const match = _buildCardMatcher([row(1, "Whatever")], [{ name: "Unrelated" }]);
    expect(match({ name: "Unrelated" })).toBeNull();
  });
});
