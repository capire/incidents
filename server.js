require('./assert')

const cds = require('@sap/cds')

cds.on('compile.for.runtime', (csn, o, next) => {
  // we need the linked model
  const dsn = next()

  function _asserts4(e) {
    let xpr = e?.['@assert']?.xpr
    if (!xpr) return
    let inherited = _asserts4(e.parent.__proto__.elements?.[e.name])
    if (inherited) {
      const _inherited = inherited.slice(1, -1)
      const _own = xpr.slice(1, -1)
      // TODO: deduplication
      xpr = ['case', ..._inherited, ..._own, 'end']
    }
    return xpr
  }

  for (const each in dsn.definitions) {
    const entity = dsn.definitions[each]
    if (entity.kind !== 'entity') continue

    if (!entity.projection) continue

    for (const each in entity.elements) {
      const element = entity.elements[each]
      if (element['@assert']) {
        element['@assert']._xpr = element['@assert'].xpr
        element['@assert'].xpr = _asserts4(element)
      }
    }
  }
})
