	'use strict';
	// ═══════════════════════════════════════════════════════════════════════
	// GLOBAL STATE
	// ═══════════════════════════════════════════════════════════════════════
	let D = null;
	let ACTIVE_VIEW = 'overview';
	let ACTIVE_ROLE = 'admin';
	let NET_VIEW = 'topology'; // 'topology' | 'table'
	const ROLE_VIEWS = {
	  admin:   null,
	  manager: ['overview','hostpools','cost','fslogix','rbac'],
	  sd:      ['overview','sessionhosts','sessions','hostpools'],
	  finops:  ['overview','cost','scaling','hostpools'],
	};

	
