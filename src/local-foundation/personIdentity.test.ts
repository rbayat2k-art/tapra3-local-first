import {describe, expect, it} from 'vitest';
import {LOCAL_USERS, ORGANIZATIONAL_POSITIONS, ORGANIZATIONAL_UNITS, PERSONNEL_RECORDS} from './seed';
import {normalizePersonName, personnelDisplayLabel, sameNamePersonnel, sameNameUsers, userDisplayLabel} from './personIdentity';

const state = {units: ORGANIZATIONAL_UNITS, positions: ORGANIZATIONAL_POSITIONS, personnel: PERSONNEL_RECORDS};

describe('person identity presentation', () => {
  it('normalizes only writing variants and never turns a name into an identifier', () => {
    expect(normalizePersonName('  سودابه\u200cمرادي ')).toBe('سودابه مرادی');
  });

  it('shows stable disambiguators for same-name personnel and users', () => {
    const personnel = PERSONNEL_RECORDS.filter((person) => `${person.firstName} ${person.lastName}` === 'سودابه مرادی');
    const users = LOCAL_USERS.filter((user) => user.name === 'سودابه مرادی');
    expect(personnel).toHaveLength(2);
    expect(users).toHaveLength(2);
    expect(sameNamePersonnel(personnel[0], PERSONNEL_RECORDS).map((item) => item.id)).toEqual([personnel[1].id]);
    expect(sameNameUsers(users[0], LOCAL_USERS).map((item) => item.id)).toEqual([users[1].id]);
    expect(personnelDisplayLabel(personnel[0], state)).toContain(personnel[0].personnelCode);
    expect(userDisplayLabel(users[0], state)).toContain(`@${users[0].username}`);
    expect(userDisplayLabel(users[0], state)).not.toBe(userDisplayLabel(users[1], state));
  });
});
