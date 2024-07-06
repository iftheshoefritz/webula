#! /bin/bash

# echo all commands using SET
set -x
rm lackey_cards.txt
rm public/cards_with_processed_columns.txt
# assumes you have lackeyCCG installed at ~/lackeyCCG and updated to the latest 2e plugin version
cat ~/LackeyCCG/plugins/startrek2e/sets/Physical.txt <(tail -n +2 ~/LackeyCCG/plugins/startrek2e/sets/Virtual.txt) > lackey_cards.txt
node scripts/split_columns.js lackey_cards.txt public/cards_with_processed_columns.txt
rm lackey_cards.txt
