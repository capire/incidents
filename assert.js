const cds = require('@sap/cds')
const getTemplate = require('@sap/cds/libx/_runtime/common/utils/template')

cds.on('served', async () => {
  const db = await cds.connect.to('db')

  db.after(['INSERT', 'UPSERT', 'UPDATE'], async (res, req) => {
    // not for NEW drafts or draft admin data
    if (req.target.name === 'DRAFT.DraftAdministrativeData') return
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

      cds.context.tx.changes[target.name] ??= []

      const keys = {}
      for (const key in target.keys) {
        if (key === 'IsActiveEntity') continue
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

        entity.assert = cds.ql
          .SELECT([...Object.keys(entity.keys).map(k => ({ ref: [k], as: `$$$_${k}` })), ...asserts])
          .from(entity)
      }

      const queries = []
      for (const k of keys) {
        queries.push(cds.ql.clone(entity.assert).where(k))
      }

      let results
      try {
        results = await this.run(queries)
      } catch (e) {
        debugger
      }

      for (const result of results) {
        for (const row of result) {
          const keyColumns = Object.entries(row)
            .filter(([k, v]) => k.startsWith('$$$_'))
            .reduce((acc, [k, v]) => ((acc[k.split('$$$_')[1]] = v), acc), {})
          const failedColumns = Object.entries(row).filter(([k, v]) => !k.startsWith('$$$_') && v !== null)

          const is_draft = entityName.endsWith('.drafts')
          let draft, draftMessages
          if (is_draft) {
            try {
              const select_draft = SELECT.one.from(entity, keyColumns).columns('DraftAdministrativeData_DraftUUID', {
                ref: ['DraftAdministrativeData'],
                expand: [{ ref: ['DraftMessages'] }]
              })
              draft = await this.run(select_draft)
              draftMessages = draft.DraftAdministrativeData.DraftMessages.filter(m => m.code !== 'ASSERT')
            } catch (e) {
              debugger
            }
          }

          for (const [element, message] of failedColumns) {
            if (is_draft) {
              const prefix = `${entity.name.split('.')[1]}(ID=${keyColumns.ID},IsActiveEntity=false)`
              draftMessages.push({
                code: 'ASSERT',
                message,
                target: element,
                numericSeverity: 4,
                prefix
              })
            } else {
              req.error({ code: 'ASSERT', message, target: 'in/' + element, '@Common.numericSeverity': 4 })
            }
          }

          if (is_draft) {
            try {
              await this.run(
                UPDATE('DRAFT.DraftAdministrativeData')
                  .set({ DraftMessages: draftMessages })
                  .where({ DraftUUID: draft.DraftAdministrativeData_DraftUUID })
              )
            } catch (error) {
              debugger
            }
          }
        }
      }
    }
  })
})
