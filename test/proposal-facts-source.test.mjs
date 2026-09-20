import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Structural checks only: this suite does not execute Lua or native TF3 values.
const source=await readFile(new URL('../mod/content/tf3mp_proposal_facts.lua',import.meta.url),'utf8');

test('proposal facts reads only its fixed documented event fields behind pcall',()=>{
  for(const marker of [
    'function M.collect(proposal, data, result)', 'pcall(function()',
    'local street = proposal.proposal', 'street.addedNodes', 'street.addedSegments',
    'street.removedNodes', 'street.removedSegments', 'street.edgeObjectsToAdd', 'proposal.toAdd',
    'proposal.toRemove', 'data.costs', 'local errorState = data.errorState',
    'local critical = errorState.critical',
    'street.edgeObjectsToAdd[index].playerEntity',
    'proposal.toAdd[index].playerEntity'
  ]) assert.ok(source.includes(marker),marker);
  assert.doesNotMatch(source,/(?<!\.)proposal\.added(?:Nodes|Segments)|(?<!\.)proposal\.removed(?:Nodes|Segments)|(?<!\.)proposal\.edgeObjectsToAdd/);
  assert.doesNotMatch(source,/\.params\b|Proposal\.clone|makeProposalData|SimpleProposal/);
});

test('proposal facts has fixed primitive JSON outcomes and bounded collection reads',()=>{
  for(const marker of [
    'MAX_ITEMS = 64', 'if count > MAX_ITEMS then return nil, "bounds" end',
    'for index = 1, edgeObjects do', 'for index = 1, constructions do',
    'if result ~= nil then', '"schemaVersion":1', '"code":"readable"',
    'fixed("unavailable", activeField)', 'fixed("bounds", field)', 'return nil, "bounds"', 'ownerCompany = 0',
    'MAX_ENTITY = 2147483647', 'value % 1 == 0',
    'integer(cost, 0, MAX_SAFE_INTEGER)', 'type(critical) ~= "boolean"'
  ]) assert.ok(source.includes(marker),marker);
  for(const field of ['street','addedNodes','addedSegments','removedNodes','removedSegments',
    'edgeObjects','constructions','removals','resultCount','cost','critical','ownerCompany']) {
    assert.match(source,new RegExp(`field = "${field}"`),field);
  }
  assert.doesNotMatch(source,/pairs\s*\(|ipairs\s*\(|for\s+\w+\s+in\s+/);
  assert.doesNotMatch(source,/math\.floor/);
  assert.doesNotMatch(source,/return\s+proposal\b|return\s+data\b|return\s+result\b/);
});

test('proposal facts has no persistence, application, command, or mutation route',()=>{
  assert.doesNotMatch(source,/\b(?:api|app)\s*\.|ug_save|saveUserdata|loadUserdata|sendCommand|cmd\s*\./);
  assert.doesNotMatch(source,/rawget|debug|metatable|setmetatable|clone|Register(?:Plugin|Recipe|Tool)/);
  assert.doesNotMatch(source,/function\s+data\s*\(|function\s+update\s*\(/);
});
