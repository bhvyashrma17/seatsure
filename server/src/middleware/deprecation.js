// [BACKEND M3.10: API versioning] The unversioned /api/events path is kept for old clients but marked
// deprecated with standard headers that point to the versioned successor. Clients get a warning
// window instead of a sudden break.
export const deprecated = ({ successor, sunset }) => (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', sunset);
  res.setHeader('Link', `<${successor}>; rel="successor-version"`);
  next();
};
