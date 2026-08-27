# Blackjack — spec

Status: in progress

## Table

- Six-deck shoe, reshuffled once fewer than three full decks remain. Checked
  between rounds, never mid-hand.
- Five seats; the player takes any open one, and cards are dealt to the seat
  playing them.

## Rules

- Dealer hits soft 17.
- Blackjack pays 3:2.
- Insurance pays 2:1, offered whenever the dealer's upcard is an ace.

## The deal

Clockwise, starting at the rightmost seat and ending with the
dealer, in two passes:

1. One card face up to each player; the dealer's own goes face down.
2. One card face up to each player. The dealer turns their first card up with
   the second, then lays that second card face down.

So the dealer ends holding an upcard from the first pass and the hole card from
the second.
