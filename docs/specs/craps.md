# Craps — spec

Status: in progress

## Table

- Eight players maximum. A player joins by interacting with the table and takes
  a standing position at the rail.
- Joining mid-round is allowed while there is room, but a player who does can
  only bet place and field until the table is off; pass and don't pass open up
  on the next come-out.

## The shooter

- One shooter at a time, throwing from a fixed spot at a short end of the table,
  down its length. That spot never moves.
- The shooter keeps the dice until they seven out — a 7 rolled with a point
  established. A come-out 2, 3 or 12 does not pass the dice; the same shooter
  rolls again.
- On a seven out the dice pass to the next player, if there is one.

## Rotation

The throwing spot is fixed, so the players are what move. Every player advances
one position clockwise when the shooter changes, which makes the line visibly
progress and puts the new shooter at the spot.

- A joining player takes the position one clockwise of the current shooter. That
  is the back of the queue — they travel the whole rail before they shoot, so
  nobody already waiting is skipped.
- A player who leaves rejoins at the back, last in line to shoot.
