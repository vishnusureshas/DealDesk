export function sortBands(bands = []) {
  return [...bands]
    .map((band) => ({
      minPct: Number(band.minPct),
      maxPct: Number(band.maxPct),
      chain: [...(band.chain ?? [])],
    }))
    .sort((left, right) => left.minPct - right.minPct);
}

// Mirrors the server's band selection: minPct < pct <= maxPct and 0% wins
// immediately without an approval chain.
export function findBandForPct(bands = [], pct) {
  const value = Number(pct);

  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;

  return (
    sortBands(bands).find(
      (band) => band.minPct < value && value <= band.maxPct,
    ) ?? null
  );
}

// Mirrors approval.service.validateConfig so the editor fails fast.
export function validateBands(bands, rolesByKey, approverKeys) {
  const errors = [];
  const parsed = sortBands(bands);

  if (parsed.length === 0) {
    errors.push('At least one approval band is required.');
    return { errors, parsed };
  }

  parsed.forEach((band, index) => {
    if (!Number.isFinite(band.minPct) || !Number.isFinite(band.maxPct)) {
      errors.push(`Band ${index + 1}: enter numeric percentages.`);
      return;
    }

    if (band.minPct < 0 || band.maxPct > 100) {
      errors.push(`Band ${index + 1}: percentages must stay between 0 and 100.`);
    }

    if (band.minPct >= band.maxPct) {
      errors.push(`Band ${index + 1}: min % must be lower than max %.`);
    }

    band.chain.forEach((roleKey) => {
      if (!rolesByKey.has(roleKey)) {
        errors.push(`Band ${index + 1}: unknown role "${roleKey}".`);
      } else if (!approverKeys.has(roleKey)) {
        errors.push(
          `Band ${index + 1}: "${roleKey}" cannot approve discounts.`,
        );
      }
    });
  });

  if (parsed[0].minPct !== 0) {
    errors.push('Bands must start at 0%.');
  }

  if (parsed[parsed.length - 1].maxPct !== 100) {
    errors.push('Bands must end at 100%.');
  }

  for (let index = 0; index < parsed.length - 1; index += 1) {
    if (parsed[index].maxPct !== parsed[index + 1].minPct) {
      errors.push(
        `Band ${index + 1} ends at ${parsed[index].maxPct}% but band ${index + 2} starts at ${parsed[index + 1].minPct}% — bands must be contiguous.`,
      );
    }
  }

  return { errors, parsed };
}
