// Add an asset.
//
// Request:
//   POST /user/history

import (
	"github.com/goplus/builder/spx-backend/internal/controller"
)

ctx := &Context

user, ok := ensureUser(ctx)
if !ok {
	return
}

params := &controller.AddUserAssetParams{}
if !parseJSON(ctx, params) {
	return
}
owner := user.Name

err := ctrl.AddUserAsset(ctx.Context(), params,"history",owner)
if err != nil {
	replyWithInnerError(ctx, err)
	return
}
json nil