// The things in here are for demo purposes only.
// They are not required in real projects.

const cds = require('@sap/cds')
if (cds.env.profiles.includes('development')) {

  // Add support role to mock users
  const { alice, bob } = cds.requires.auth.users
  alice.roles = ['admin','support']
  bob.roles = ['support']
 
}

//@assert temporary implementation

const getTemplate = require('@sap/cds/libx/_runtime/common/utils/template')

cds.on('served', async () => {
  const db = await cds.connect.to('db')

  db.after(['INSERT', 'UPSERT', 'UPDATE'], async (res, req) => {
    // not for NEW drafts
    if (req.event === 'CREATE' && req.target.name.endsWith('.drafts')) return

    const IS_DRAFT = req.target.name.endsWith('.drafts')

    const template = getTemplate('assert', db, req.target, {
      pick: element => {
        // for drafts, we need to pick each element
        if (IS_DRAFT) return element['@assert']

        if (!element['@assert']) return false

        // Ensure each parent of an element with @assert is picked only once
        // template.process is called for each picked property of each row
        // and we only want to collect the keys of each changed row once
        const assertPicked = Symbol.for('assertPicked')
        if (element.parent[assertPicked]) return false

        element.parent[assertPicked] = true
        return true
      },
      ignore: element => element.isAssociation && !element.isComposition
    })

    // Collect entity keys and their values of changed rows

    cds.context.tx.changes ??= {}

    template.process(req.data, elementInfo => {
      const { row, target } = elementInfo

      // for drafts, only consider changed elements (= in req.data)
      if (IS_DRAFT) {
        const touched = Object.keys(req.data).filter(e => !Object.keys(target.keys).includes(e))
        if (touched.every(e => !target.elements[e]['@assert'])) return
      }

      cds.context.tx.changes[target.name] ??= []

      const keys = {}
      for (const key in target.keys) {
        if (!(key in row)) return
        keys[key] = row[key]
      }

      cds.context.tx.changes[target.name].push(keys)
    })
  })

  db.before('COMMIT', async function (req) {
    const { changes } = cds.context.tx
    if (!changes) return

    for (const [entityName, keys] of Object.entries(changes)) {
      const entity = cds.model.definitions[entityName]

      // Cache assert query on entity
      if (!entity.assert) {
        const asserts = []

        for (const element of Object.values(entity.elements)) {
          if (element._foreignKey4) continue
          if (element.isAssociation && !element.isComposition) continue

          const assert = element['@assert']
          if (!assert) continue

          asserts.push({ xpr: assert.xpr, as: element.name })
        }

        entity.assert = cds.ql.SELECT(asserts).from(entity)
      }

      const query = cds.ql.clone(entity.assert)

      // Select only rows with changes
      const keyNames = Object.keys(entity.keys).filter(k => !entity.keys[k].virtual && !entity.keys[k].isAssociation)

      query.where([
        { list: keyNames.map(k => ({ ref: [k] })) },
        'in',
        { list: keys.map(keyKV => ({ list: keyNames.map(k => ({ val: keyKV[k] })) })) }
      ])

      let result
      try {
        result = await this.run(query)
      } catch (e) {
        debugger
      }

      for (const row of result) {
        const failedColumns = Object.entries(row).filter(([k, v]) => v !== null)

        for (const [element, message] of failedColumns) {
          const target = 'in/' + element
          req.error({ code: 400, message, target, '@Common.numericSeverity': 4 })
        }
      }
    }
  })
})
