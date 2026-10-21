function authorizeRoles(...allowedRoles) {
  return (request, response, next) => {
    if (!request.auth || !allowedRoles.includes(request.auth.role)) {
      return response.status(403).json({ message: 'You do not have permission to access this resource.' })
    }
    return next()
  }
}

module.exports = { authorizeRoles }
