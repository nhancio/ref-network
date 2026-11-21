// Graph layout & search/path model shared by the Canvas renderer and Directory UI

function matchesSource(contact, sourceFilter) {
  if (!sourceFilter || sourceFilter === 'all') return true;
  if (sourceFilter === 'intro') return Boolean(contact.canIntroduce);
  if (sourceFilter === 'contacts') {
    return contact.sources.some((s) => s === 'google' || s === 'vcf' || s === 'csv' || s === 'picker' || s === 'manual');
  }
  return contact.sources.includes(sourceFilter);
}

function matchesSearch(haystack, tokens) {
  if (!tokens.length) return true;
  const lower = haystack.toLowerCase();
  return tokens.every((t) => lower.includes(t));
}

export function buildGraphModel({
  user = { name: 'You', photoUrl: '' },
  contacts = [],
  circleConnections = [],
  mode = 'auto', // 'auto' | 'companies' | 'people'
  sourceFilter = 'all', // 'all' | 'linkedin' | 'contacts' | 'circle' | 'intro'
  searchQuery = '',
  expandedCompanyKey = null,
}) {
  const query = String(searchQuery ?? '').trim().toLowerCase();
  const tokens = query ? query.split(/\s+/).filter(Boolean) : [];

  const filteredContacts = sourceFilter === 'circle'
    ? []
    : contacts.filter((c) => {
        if (!matchesSource(c, sourceFilter)) return false;
        if (!tokens.length) return true;
        return matchesSearch(`${c.name} ${c.company} ${c.role} ${c.email} ${c.notes}`, tokens);
      });

  // Group contacts by normalized companyKey
  const companyMap = new Map();
  const ungrouped = [];

  for (const c of filteredContacts) {
    if (!c.companyKey) {
      ungrouped.push(c);
      continue;
    }
    let group = companyMap.get(c.companyKey);
    if (!group) {
      group = {
        key: c.companyKey,
        name: c.company,
        people: [],
        introCount: 0,
        sources: new Set(),
      };
      companyMap.set(c.companyKey, group);
    }
    group.people.push(c);
    if (c.canIntroduce) group.introCount++;
    for (const s of c.sources) group.sources.add(s);
    if (c.company.length > group.name.length) group.name = c.company;
  }

  const companies = Array.from(companyMap.values()).sort(
    (a, b) => b.people.length - a.people.length || b.introCount - a.introCount || a.name.localeCompare(b.name),
  );

  // Filter Ref Circle friends & their shared anonymized 2nd-degree companies (never third-party PII)
  const includeCircle = sourceFilter === 'all' || sourceFilter === 'circle' || sourceFilter === 'intro';
  const activeCircle = includeCircle
    ? circleConnections
        .filter((conn) => conn.status === 'connected')
        .map((conn) => {
          const sharedCompanies = (conn.sharedCompanies || []).filter((co) => {
            if (sourceFilter === 'intro' && !co.introCount) return false;
            if (!tokens.length) return true;
            const roleText = Array.isArray(co.roles) ? co.roles.join(' ') : '';
            return matchesSearch(`${conn.name} ${co.company} ${roleText}`, tokens);
          });
          const personMatches = !tokens.length || matchesSearch(`${conn.name} ${conn.headline || ''}`, tokens);
          if (!personMatches && !sharedCompanies.length) return null;
          return { ...conn, sharedCompanies };
        })
        .filter(Boolean)
    : [];

  const effectiveMode = mode === 'auto'
    ? (companies.length >= 3 && filteredContacts.length > 22 && !query
        ? 'companies'
        : companies.length >= 3 && filteredContacts.length > 36
          ? 'companies'
          : 'people')
    : mode;

  const nodes = [];
  const edges = [];

  // 1. Center "You" node
  nodes.push({
    id: 'you',
    kind: 'you',
    label: user.name || 'You',
    sublabel: 'Your network',
    photoUrl: user.photoUrl || '',
    x: 0,
    y: 0,
    radius: 34,
    ring: 0,
  });

  // 2. Circle friends (warm apricot bridge nodes on inner ring)
  const circleCount = activeCircle.length;
  activeCircle.forEach((friend, idx) => {
    const angle = -Math.PI * 0.65 + (circleCount > 1 ? (idx / (circleCount - 1)) * Math.PI * 0.5 : 0);
    const dist = 165;
    const fx = Math.cos(angle) * dist;
    const fy = Math.sin(angle) * dist;
    const friendNodeId = `circle:${friend.uid}`;
    nodes.push({
      id: friendNodeId,
      kind: 'circle',
      label: friend.name,
      sublabel: `${friend.sharedCompanies.length} shared orgs`,
      photoUrl: friend.photoUrl || '',
      data: friend,
      x: fx,
      y: fy,
      radius: 23,
      ring: 1,
    });
    edges.push({
      from: 'you',
      to: friendNodeId,
      kind: 'circle',
      highlighted: Boolean(query),
    });

    // Second-degree companies reachable via this circle friend
    const secondDegree = friend.sharedCompanies.slice(0, 6);
    secondDegree.forEach((co, cIdx) => {
      const spread = secondDegree.length > 1 ? (cIdx - (secondDegree.length - 1) / 2) * 0.34 : 0;
      const cAngle = angle + spread;
      const cDist = dist + 145;
      const nodeId = `second:${friend.uid}:${co.companyKey}`;
      const roleHint = Array.isArray(co.roles) && co.roles.length ? ` · ${co.roles[0]}` : '';
      nodes.push({
        id: nodeId,
        kind: 'second-company',
        label: co.company,
        sublabel: `Via ${friend.name.split(' ')[0]} · ${co.count}${roleHint}`,
        viaFriend: friend,
        data: co,
        x: Math.cos(cAngle) * cDist,
        y: Math.sin(cAngle) * cDist,
        radius: 19,
        ring: 2,
      });
      edges.push({
        from: friendNodeId,
        to: nodeId,
        kind: 'second',
        highlighted: Boolean(query),
      });
    });
  });

  // 3. Direct graph content: Company Hubs OR People
  const startAngleOffset = circleCount ? 0.12 : -Math.PI / 2;

  if (effectiveMode === 'companies') {
    const maxHubs = 28;
    const shownCompanies = companies.slice(0, maxHubs);
    if (expandedCompanyKey && !shownCompanies.some((c) => c.key === expandedCompanyKey)) {
      const target = companies.find((c) => c.key === expandedCompanyKey);
      if (target) shownCompanies[shownCompanies.length - 1] = target;
    }

    const totalHubs = shownCompanies.length + (ungrouped.length ? 1 : 0);
    const items = [...shownCompanies];
    if (ungrouped.length) {
      items.push({
        key: '__direct__',
        name: 'Direct Contacts',
        people: ungrouped,
        introCount: ungrouped.filter((p) => p.canIntroduce).length,
        sources: new Set(ungrouped.flatMap((p) => p.sources)),
      });
    }

    items.forEach((company, idx) => {
      const ringIndex = idx < 10 ? 1 : 2;
      const ringItems = ringIndex === 1 ? Math.min(totalHubs, 10) : Math.max(1, totalHubs - 10);
      const posInRing = ringIndex === 1 ? idx : idx - 10;
      const radiusDist = ringIndex === 1 ? 190 : 325;
      const angle = startAngleOffset + (posInRing / ringItems) * Math.PI * 2 + (ringIndex === 2 ? 0.22 : 0);
      const cx = Math.cos(angle) * radiusDist;
      const cy = Math.sin(angle) * radiusDist;
      const hubRadius = Math.min(30, 16 + Math.round(Math.log2(company.people.length + 1) * 4.5));
      const hubId = `company:${company.key}`;
      const isExpanded = expandedCompanyKey === company.key;

      nodes.push({
        id: hubId,
        kind: 'company',
        label: company.name,
        sublabel: `${company.people.length} ${company.people.length === 1 ? 'person' : 'people'}`,
        count: company.people.length,
        introCount: company.introCount,
        expanded: isExpanded,
        data: company,
        x: cx,
        y: cy,
        radius: isExpanded ? hubRadius + 4 : hubRadius,
        ring: ringIndex,
      });
      edges.push({
        from: 'you',
        to: hubId,
        kind: company.introCount > 0 ? 'intro' : 'company',
        highlighted: isExpanded || Boolean(query),
      });

      // Expand individual people radially around the selected company hub
      if (isExpanded) {
        const peopleToShow = company.people.slice(0, 14);
        peopleToShow.forEach((person, pIdx) => {
          const fanSpread = peopleToShow.length > 1
            ? (pIdx - (peopleToShow.length - 1) / 2) * (Math.min(0.45, 2.5 / peopleToShow.length))
            : 0;
          const pAngle = angle + fanSpread;
          const pDist = radiusDist + 118 + (pIdx % 2) * 28;
          const pNodeId = `person:${person.id}`;
          nodes.push({
            id: pNodeId,
            kind: 'person',
            label: person.name,
            sublabel: person.role || person.company || person.sources.join(' · '),
            photoUrl: person.photoUrl || '',
            data: person,
            x: Math.cos(pAngle) * pDist,
            y: Math.sin(pAngle) * pDist,
            radius: 17,
            ring: ringIndex + 1,
          });
          edges.push({
            from: hubId,
            to: pNodeId,
            kind: person.canIntroduce ? 'intro' : 'person',
            highlighted: true,
          });
        });
      }
    });
  } else {
    // People view (ideal for <= 36 contacts or targeted searches)
    const shownPeople = filteredContacts.slice(0, 48);
    shownPeople.forEach((person, idx) => {
      const ringIndex = idx < 12 ? 1 : idx < 28 ? 2 : 3;
      const ringStart = ringIndex === 1 ? 0 : ringIndex === 2 ? 12 : 28;
      const ringCap = ringIndex === 1 ? Math.min(shownPeople.length, 12) : ringIndex === 2 ? Math.min(shownPeople.length - 12, 16) : Math.max(1, shownPeople.length - 28);
      const posInRing = idx - ringStart;
      const dist = ringIndex === 1 ? 175 : ringIndex === 2 ? 290 : 395;
      const angle = startAngleOffset + (posInRing / ringCap) * Math.PI * 2 + ringIndex * 0.25;
      const pNodeId = `person:${person.id}`;

      nodes.push({
        id: pNodeId,
        kind: 'person',
        label: person.name,
        sublabel: person.company || person.role || person.sources.join(' · '),
        photoUrl: person.photoUrl || '',
        data: person,
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        radius: person.canIntroduce ? 21 : 18,
        ring: ringIndex,
      });
      edges.push({
        from: 'you',
        to: pNodeId,
        kind: person.canIntroduce ? 'intro' : 'person',
        highlighted: Boolean(query) || Boolean(person.canIntroduce),
      });
    });
  }

  const stats = {
    totalContacts: contacts.length,
    visibleContacts: filteredContacts.length,
    linkedinCount: contacts.filter((c) => c.sources.includes('linkedin')).length,
    contactsCount: contacts.filter((c) => c.sources.some((s) => s !== 'linkedin')).length,
    companyCount: new Set(contacts.map((c) => c.companyKey).filter(Boolean)).size,
    introCount: contacts.filter((c) => c.canIntroduce).length,
    circleCount: circleConnections.filter((c) => c.status === 'connected').length,
  };

  return {
    effectiveMode,
    nodes,
    edges,
    companies,
    matchedContacts: filteredContacts,
    activeCircle,
    stats,
  };
}
