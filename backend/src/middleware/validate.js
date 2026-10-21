function validate(schema, source) {
  return (request, response, next) => {
    const input = source === 'body'
      ? request.body
      : source === 'params'
        ? request.params.id ?? request.params.sosId ?? request.params.connectionId ?? request.params.medicationId ?? request.params.checkInId ?? request.params.elderId
        : source === 'queryObject' ? request.query : request.query.query
    const result = schema.safeParse(input)
    if (!result.success) {
      return response.status(400).json({
        message: 'Please check the submitted information.',
        errors: result.error.issues.map(({ path, message }) => ({ field: path.join('.') || source, message })),
      })
    }
    if (source === 'body') request.body = result.data
    if (source === 'query' || source === 'queryObject') request.validatedQuery = result.data
    if (source === 'params') request.validatedId = result.data
    return next()
  }
}

module.exports = { validate }
