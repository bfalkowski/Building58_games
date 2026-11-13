#!/usr/bin/env node
// The office runs this file for a round of Listing review (game.json: entry).
import { run } from '../kit/runner.js';
import * as rules from './rules.js';

run(rules);
