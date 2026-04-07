import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common'

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse()
    const request = ctx.getRequest() as any

    const requestId: string | undefined = request?.requestId

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let details: any = undefined

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const res = exception.getResponse() as any
      message = (res && (res.message || res.error)) || exception.message
      details = res && res.details
    } else if (exception && typeof exception === 'object') {
      message = (exception as any).message || message
    }

    const body = {
      error: {
        message,
        status,
        code: status,
        details,
      },
      path: request?.url,
      method: request?.method,
      requestId,
      timestamp: new Date().toISOString(),
    }

    response.status(status).json(body)
  }
}

